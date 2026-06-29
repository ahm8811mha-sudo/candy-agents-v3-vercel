"use client";

import { useEffect, useState } from "react";
import { LineChart, Loader2, Clock, ShieldAlert, ArrowUpRight, ArrowDownRight, Minus, Filter } from "lucide-react";

type Signal = {
  signal: "BUY" | "SELL" | "HOLD" | "FILTERED";
  reason: string;
  price: number;
  takeProfit: number | null;
  stopLoss: number | null;
  volatilityPct: number | null;
  indicators: {
    rsi: number | null;
    bb: { upper: number; middle: number; lower: number } | null;
    macd: { macd: number; signal: number; histogram: number } | null;
    atr: number | null;
  };
};

type Market = { isOpen: boolean; minutesToClose: number; shouldFlatten: boolean };

type Response = {
  ok: boolean;
  signal: Signal;
  market: Market;
  config: { volatilityMaxPct: number; takeProfitPct: number; stopLossPct: number };
  sessionLimits: { maxDailyLossPct: number; maxOpenPositions: number; maxTradesPerDay: number };
  broker: { alpacaConfigured: boolean; mode: string };
};

const signalMeta: Record<string, { label: string; color: string; Icon: typeof ArrowUpRight }> = {
  BUY: { label: "شراء", color: "var(--green)", Icon: ArrowUpRight },
  SELL: { label: "بيع/خروج", color: "var(--red)", Icon: ArrowDownRight },
  HOLD: { label: "انتظار", color: "var(--muted)", Icon: Minus },
  FILTERED: { label: "مُستبعد (تذبذب)", color: "var(--amber)", Icon: Filter },
};

export default function ScalpingSignalPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/trading/signal", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setData(json);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading && !data) {
    return (
      <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
        <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  if (!data) return null;

  const meta = signalMeta[data.signal.signal];
  const SignalIcon = meta.Icon;

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><LineChart size={16} /> استراتيجية Scalping محافظة</span>
          <h2>إشارة RSI + Bollinger + MACD</h2>
        </div>
        <span className={`status-pill ${data.market.isOpen ? "done" : ""}`}>
          <Clock size={14} />
          {data.market.isOpen ? `السوق مفتوح · ${data.market.minutesToClose}د للإغلاق` : "السوق مغلق"}
        </span>
      </div>

      <p className="notice" style={{ color: "var(--muted)" }}>
        وسيط Alpaca: {data.broker.alpacaConfigured ? `متصل (${data.broker.mode === "live" ? "حقيقي" : "ورقي/Paper"})` : "غير مُهيّأ"} ·
        فلتر التذبذب ≤ {(data.config.volatilityMaxPct * 100).toFixed(1)}% · TP {(data.config.takeProfitPct * 100).toFixed(1)}% / SL {(data.config.stopLossPct * 100).toFixed(1)}%
      </p>

      {data.market.shouldFlatten && (
        <p className="notice" style={{ color: "var(--amber)" }}>
          <ShieldAlert size={14} /> نافذة التصفية: يتم إغلاق كل المراكز قبل نهاية الجلسة بـ 15 دقيقة.
        </p>
      )}

      <div className="report-section-box" style={{ borderColor: meta.color }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 44, height: 44, borderRadius: 10, display: "grid", placeItems: "center", background: "var(--panel-2)", color: meta.color }}>
            <SignalIcon size={22} />
          </span>
          <div>
            <strong style={{ fontSize: "1.3rem", color: meta.color }}>{meta.label}</strong>
            <br />
            <small style={{ color: "var(--muted)" }}>{data.signal.reason}</small>
          </div>
          <button className="secondary-btn" style={{ marginInlineStart: "auto" }} onClick={load} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : "تحديث"}
          </button>
        </div>

        {(data.signal.signal === "BUY" || data.signal.signal === "SELL") && (
          <div className="finance-summary" style={{ marginTop: 14 }}>
            <div className="metric-card"><small>السعر</small><strong>{data.signal.price.toFixed(2)}</strong></div>
            <div className="metric-card green"><small>جني الأرباح TP</small><strong>{data.signal.takeProfit?.toFixed(2)}</strong></div>
            <div className="metric-card red"><small>وقف الخسارة SL</small><strong>{data.signal.stopLoss?.toFixed(2)}</strong></div>
          </div>
        )}
      </div>

      <div className="report-kpi-grid">
        <div className="kpi-card-inner">
          <small>RSI</small>
          <strong>{data.signal.indicators.rsi?.toFixed(1) ?? "—"}</strong>
        </div>
        <div className="kpi-card-inner">
          <small>MACD Histogram</small>
          <strong>{data.signal.indicators.macd?.histogram.toFixed(3) ?? "—"}</strong>
        </div>
        <div className="kpi-card-inner">
          <small>التذبذب ATR/Price</small>
          <strong>{data.signal.volatilityPct !== null ? `${(data.signal.volatilityPct * 100).toFixed(2)}%` : "—"}</strong>
        </div>
      </div>

      <p style={{ color: "var(--muted)", fontSize: "0.8rem", lineHeight: 1.7, margin: 0 }}>
        ضوابط الجلسة: حد خسارة يومي {(data.sessionLimits.maxDailyLossPct * 100).toFixed(0)}% · أقصى {data.sessionLimits.maxOpenPositions} مراكز · {data.sessionLimits.maxTradesPerDay} صفقة/يوم.
        هذه إشارة على بيانات تجريبية للعرض — التنفيذ الفعلي يتطلب تهيئة Alpaca وتفعيلاً صريحاً.
      </p>
    </div>
  );
}
