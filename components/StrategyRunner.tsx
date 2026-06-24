"use client";

import { FormEvent, useState } from "react";

type Result = {
  marketResult?: string;
  opportunityResult?: string;
  decisionResult?: string;
  executionResult?: string;
} | null;

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
      const res = await fetch("/api/agents/pipeline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          market: f.get("market"),
          budget: f.get("budget"),
          goal: f.get("goal"),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.message || "pipeline failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "pipeline failed");
    } finally {
      setLoading(false);
    }
  }

  return <section id="agent-pipeline" className="card" style={{ marginTop: 16 }}>
    <h1>AI Agents Control Panel</h1>
    <p style={{ color: "var(--muted)", marginTop: -4 }}>Market Agent → Opportunity Agent → Decision Agent → Execution Agent</p>
    <form className="form two" onSubmit={submit}>
      <input className="input" name="budget" type="number" defaultValue="50000" placeholder="Budget" />
      <input className="input" name="market" defaultValue="E-commerce retail in Saudi Arabia" placeholder="Market" />
      <textarea className="textarea" name="goal" defaultValue="Find a profitable retail opportunity and execution plan" placeholder="Goal" />
      <button className="primary-btn" disabled={loading}>{loading ? "Running agents..." : "Run full AI pipeline"}</button>
    </form>
    {error && <p className="badge red" style={{ marginTop: 10 }}>{error}</p>}
    {result && <div className="feed" style={{ marginTop: 16 }}>
      <div className="feed-item"><strong>1. Market Analyst Agent</strong><span>{result.marketResult}</span></div>
      <div className="feed-item"><strong>2. Opportunity Agent</strong><span>{result.opportunityResult}</span></div>
      <div className="feed-item"><strong>3. Decision Agent</strong><span>{result.decisionResult}</span></div>
      <div className="feed-item"><strong>4. Execution Agent</strong><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{result.executionResult}</pre></div>
    </div>}
  </section>;
}
