"use client";

import { useState, useEffect } from "react";
import { Brain, Search, TrendingUp, Loader2 } from "lucide-react";

type Memory = {
  id: string;
  event_type: string;
  title: string;
  summary: string;
  decision_quality: string;
  created_at: string;
};

type Pattern = {
  pattern: string;
  successRate: number;
  totalDecisions: number;
  avgHealthScore: number;
  recommendation: string;
};

const qualityColors: Record<string, string> = {
  SUCCESS: "var(--green)",
  PROMISING: "var(--primary)",
  WATCH: "var(--amber)",
  FAILED: "var(--red)",
};

const qualityLabels: Record<string, string> = {
  SUCCESS: "ناجح",
  PROMISING: "واعد",
  WATCH: "مراقبة",
  FAILED: "فشل",
};

export default function AgentMemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"memories" | "patterns">("memories");

  useEffect(() => {
    loadMemories();
    loadPatterns();
  }, []);

  async function loadMemories() {
    setLoading(true);
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      if (data.ok) setMemories(data.memories || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function loadPatterns() {
    try {
      const res = await fetch("/api/memory?action=patterns");
      const data = await res.json();
      if (data.ok) setPatterns(data.patterns || []);
    } catch {
      // silent
    }
  }

  async function search() {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/memory?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      if (data.ok) setMemories(data.memories || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><Brain size={16} /> ذاكرة الوكلاء</span>
          <h2>القرارات والأنماط السابقة</h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={activeTab === "memories" ? "primary-btn" : "secondary-btn"}
            onClick={() => setActiveTab("memories")}
          >
            <Brain size={16} /> القرارات
          </button>
          <button
            className={activeTab === "patterns" ? "primary-btn" : "secondary-btn"}
            onClick={() => setActiveTab("patterns")}
          >
            <TrendingUp size={16} /> الأنماط
          </button>
        </div>
      </div>

      {activeTab === "memories" && (
        <>
          <div className="memory-search-bar">
            <input
              className="input"
              placeholder="بحث في القرارات السابقة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
              aria-label="بحث في القرارات"
            />
            <button className="secondary-btn" onClick={search} disabled={loading} aria-label="بحث">
              {loading ? <Loader2 className="spin" size={16} /> : <Search size={16} />}
            </button>
          </div>

          {memories.length === 0 && !loading && (
            <div className="empty-state" style={{ minHeight: 160 }}>
              <Brain size={28} />
              <strong>لا توجد قرارات محفوظة بعد</strong>
              <span>ستظهر هنا القرارات السابقة مع تقييم جودتها</span>
            </div>
          )}

          <div className="memory-list">
            {memories.map((m) => (
              <div key={m.id} className="report-card">
                <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{m.title}</span>
                  <span
                    className="mini-pill"
                    style={{ color: qualityColors[m.decision_quality] || "var(--muted)" }}
                  >
                    {qualityLabels[m.decision_quality] || m.decision_quality}
                  </span>
                </h3>
                <pre>{m.summary.slice(0, 300)}</pre>
              </div>
            ))}
          </div>
        </>
      )}

      {activeTab === "patterns" && (
        <div className="memory-list">
          {patterns.length === 0 && (
            <div className="empty-state" style={{ minHeight: 160 }}>
              <TrendingUp size={28} />
              <strong>لا توجد أنماط كافية بعد</strong>
            </div>
          )}

          {patterns.map((p) => (
            <div key={p.pattern} className="report-card">
              <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{p.pattern}</span>
                <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                  {p.totalDecisions} قرار
                </span>
              </h3>
              <div style={{ padding: 16 }}>
                <div className="pattern-stats">
                  <div className="pattern-stat">
                    <strong style={{ color: p.successRate >= 60 ? "var(--green)" : "var(--amber)", fontSize: "1.4rem" }}>
                      {p.successRate}%
                    </strong>
                    <br />
                    <small>نسبة النجاح</small>
                  </div>
                  <div className="pattern-stat">
                    <strong style={{ fontSize: "1.4rem" }}>{p.avgHealthScore}</strong>
                    <br />
                    <small>متوسط الصحة</small>
                  </div>
                  <div className="pattern-stat">
                    <strong style={{ fontSize: "1.4rem" }}>{p.totalDecisions}</strong>
                    <br />
                    <small>إجمالي القرارات</small>
                  </div>
                </div>
                <div className="statement-row" style={{ background: "rgba(124, 199, 255, 0.06)" }}>
                  <span>{p.recommendation}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
