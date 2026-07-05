import express from "express";
import { chromium } from "playwright";

const app = express();
const port = Number(process.env.PORT || 8787);
const secret = process.env.RUNNER_SECRET || "";

app.use(express.json({ limit: "2mb" }));

const sessions = new Map();
const protectedWords = ["ارسال", "إرسال", "اعتماد", "دفع", "تأكيد", "اقرار", "إقرار", "تقديم", "submit", "confirm", "pay", "approve"];
const allowedKeys = new Set(["Tab", "Backspace", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"]);

function check(req, res, next) {
  if (!secret || req.headers["x-runner-secret"] === secret) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

async function snapshot(page) {
  return await page.screenshot({ type: "jpeg", quality: 70, fullPage: false, encoding: "base64" });
}

function publicSession(item) {
  return { id: item.id, targetUrl: item.targetUrl, status: item.status, createdAt: item.createdAt, screenshot: item.lastScreenshot };
}

async function isProtectedClick(page, x, y) {
  return await page.evaluate(({ x, y, protectedWords }) => {
    const element = document.elementFromPoint(x, y);
    if (!element) return false;
    const closest = element.closest("button,a,input,textarea,select,label,[role='button']") || element;
    const text = [closest.innerText, closest.textContent, closest.value, closest.getAttribute("aria-label"), closest.getAttribute("title")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return protectedWords.some((word) => text.includes(String(word).toLowerCase()));
  }, { x, y, protectedWords });
}

async function runCommand(item, body) {
  const kind = String(body?.kind || "");
  if (kind === "point") {
    const x = Number(body?.x);
    const y = Number(body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid coordinates");
    if (await isProtectedClick(item.page, x, y)) {
      const error = new Error("Protected action requires manual owner review");
      error.statusCode = 409;
      throw error;
    }
    await item.page.mouse.click(x, y);
    item.status = "CONTROLLED";
    return;
  }
  if (kind === "text") {
    const text = String(body?.text || "").slice(0, 2000);
    if (!text) throw new Error("Text is required");
    await item.page.keyboard.type(text, { delay: 15 });
    item.status = "CONTROLLED";
    return;
  }
  if (kind === "key") {
    const key = String(body?.key || "");
    if (!allowedKeys.has(key)) throw new Error("Key is not allowed");
    await item.page.keyboard.press(key);
    return;
  }
  if (kind === "wheel") {
    const deltaY = Number(body?.deltaY || 600);
    await item.page.mouse.wheel(0, Number.isFinite(deltaY) ? deltaY : 600);
    return;
  }
  throw new Error("Unknown command");
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "orvanta-remote-runner", browser: "chromium", controls: ["point", "text", "key", "wheel"] });
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
    res.json({ ok: true, session: publicSession(item) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Runner failed" });
  }
});

app.get("/sessions/:id", check, async (req, res) => {
  try {
    const item = sessions.get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });
    item.lastScreenshot = await snapshot(item.page);
    res.json({ ok: true, session: publicSession(item) });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Snapshot failed" });
  }
});

app.post("/sessions/:id/command", check, async (req, res) => {
  try {
    const item = sessions.get(req.params.id);
    if (!item) return res.status(404).json({ ok: false, error: "Not found" });
    await runCommand(item, req.body || {});
    item.lastScreenshot = await snapshot(item.page);
    res.json({ ok: true, session: publicSession(item) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ ok: false, error: error instanceof Error ? error.message : "Command failed" });
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
