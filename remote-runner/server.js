import express from "express";
import { chromium } from "playwright";

const app = express();
const port = Number(process.env.PORT || 8787);
const secret = process.env.RUNNER_SECRET || "";

app.use(express.json({ limit: "2mb" }));

const sessions = new Map();

function check(req, res, next) {
  if (!secret || req.headers["x-runner-secret"] === secret) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

async function snapshot(page) {
  return await page.screenshot({ type: "jpeg", quality: 70, fullPage: false, encoding: "base64" });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "orvanta-remote-runner", browser: "chromium" });
});

app.post("/sessions", check, async (req, res) => {
  try {
    const id = String(req.body?.sessionId || Date.now());
    const targetUrl = String(req.body?.targetUrl || "");
    if (!targetUrl.startsWith("https://")) return res.status(400).json({ ok: false, error: "Only HTTPS URLs are accepted" });
    const browser = await chromium.launch({ headless: process.env.HEADLESS !== "false", args: ["--no-sandbox"] });
    const context = await browser.newContext({ viewport: { width: 1365, height: 768 } });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const item = { id, targetUrl, status: "OPENED", browser, context, page, createdAt: new Date().toISOString(), lastScreenshot: await snapshot(page) };
    sessions.set(id, item);
    res.json({ ok: true, session: { id, targetUrl, status: item.status, createdAt: item.createdAt, screenshot: item.lastScreenshot } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Runner failed" });
  }
});

app.get("/sessions/:id", check, async (req, res) => {
  try {
    const item = sessions.get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });
    item.lastScreenshot = await snapshot(item.page);
    res.json({ ok: true, session: { id: item.id, targetUrl: item.targetUrl, status: item.status, createdAt: item.createdAt, screenshot: item.lastScreenshot } });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Snapshot failed" });
  }
});

app.post("/sessions/:id/close", check, async (req, res) => {
  const item = sessions.get(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  await item.browser.close();
  sessions.delete(req.params.id);
  res.json({ ok: true });
});

app.listen(port, () => {
  console.log(`runner listening on ${port}`);
});
