"use client";

import { FormEvent, useState } from "react";

type Result = { marketSummary?: string; decision?: string; plan?: string } | null;

export default function StrategyRunner() {
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/intelligence/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ budget: f.get("budget"), riskProfile: f.get("riskProfile"), market: f.get("market"), goals: f.get("goals") }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return <section className="card">
    <h1>Strategy Center</h1>
    <form className="form two" onSubmit={submit}>
      <input className="input" name="budget" type="number" defaultValue="30000" />
      <select className="input" name="riskProfile" defaultValue="MEDIUM"><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option></select>
      <input className="input" name="market" defaultValue="retail" />
      <textarea className="textarea" name="goals" defaultValue="find a testable opportunity" />
      <button className="primary-btn" disabled={loading}>{loading ? "Running..." : "Run"}</button>
    </form>
    {error && <p>{error}</p>}
    {result && <div className="feed" style={{ marginTop: 16 }}><div className="feed-item"><strong>Summary</strong><span>{result.marketSummary}</span></div><div className="feed-item"><strong>Decision</strong><span>{result.decision}</span></div><div className="feed-item"><strong>Plan</strong><pre style={{ whiteSpace: "pre-wrap" }}>{result.plan}</pre></div></div>}
  </section>;
}
