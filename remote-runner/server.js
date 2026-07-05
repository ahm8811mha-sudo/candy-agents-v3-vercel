import express from "express";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(express.json());

const sessions = new Map();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "orvanta-remote-runner" });
});

app.post("/sessions", (req, res) => {
  const id = String(req.body?.sessionId || Date.now());
  const targetUrl = String(req.body?.targetUrl || "");
  const item = { id, targetUrl, status: "READY", createdAt: new Date().toISOString() };
  sessions.set(id, item);
  res.json({ ok: true, session: item });
});

app.get("/sessions/:id", (req, res) => {
  const item = sessions.get(req.params.id);
  if (!item) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, session: item });
});

app.listen(port, () => {
  console.log(`runner listening on ${port}`);
});
