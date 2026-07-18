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

type Market = { isOpen: boolean; minutesToClose: number; shouldFlatten: boolean; nextOpen?: string; nextClose?: string; source?: string };

type Response = {
  ok: boolean;
  demo: boolean;
  source: "alpaca" | "demo" | "custom";
  symbol: string;
  asOf?: string | null;
  signal: Signal;
  market: Market;
  config: { volatilityMaxPct: number; takeProfitPct: number; stopLossPct: number };
  sessionLimits: { maxDailyLossPct: number; maxOpenPositions: number; maxTradesPerDay: number };
  broker: { configured: boolean; mode: string; feed: string };
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
  const [error, setError] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/trading/signal", { cache: "no-store", signal });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "تعذّر تحميل إشارة السوق.");
      setData(json);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "تعذّر تحميل إشارة السوق.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  if (loading && !data) {
    return (
      <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
        <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="delivery-panel fade-in trading-signal-error">
        <ShieldAlert size={24} />
        <strong>تعذّرت قراءة بيانات السوق</strong>
        <span>{error || "تحقق من مفاتيح Alpaca ثم أعد المحاولة."}</span>
        <button className="secondary-btn" onClick={() => load()}>إعادة المحاولة</button>
      </div>
    );
  }

  const meta = signalMeta[data.signal.signal];
  const SignalIcon = meta.Icon;

  return (
    <div className="delivery-panel fade-in trading-signal-panel" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header trading-panel-header">
        <div>
          <span className="eyebrow"><LineChart size={16} /> استراتيجية Scalping محافظة</span>
          <h2>{data.symbol} · RSI + Bollinger + MACD</h2>
        </div>
        <div className="trading-header-actions">
          <span className={`status-pill ${data.source === "alpaca" ? "done" : ""}`}>
            {data.source === "alpaca" ? "بيانات Alpaca" : "بيانات تجريبية"}
          </span>
          <span className={`status-pill ${data.market.isOpen ? "done" : ""}`}>
            <Clock size={14} />
            {data.market.isOpen ? `مفتوح · ${data.market.minutesToClose}د` : "السوق مغلق"}
          </span>
        </div>
      </div>

      {error && <p className="notice error">{error}</p>}

      <p className="notice integration-notice" style={{ color: "var(--muted)" }}>
        وسيط Alpaca: {data.broker.configured ? `متصل (${data.broker.mode === "live" ? "حقيقي" : "ورقي/Paper"})` : "غير مُهيّأ"} ·
        المصدر {data.source === "alpaca" ? `${data.broker.feed.toUpperCase()} الحقيقي` : "سلسلة عرض محلية"} ·
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
          <button className="secondary-btn" style={{ marginInlineStart: "auto" }} onClick={() => load()} disabled={loading}>
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
        {data.demo
          ? " هذه إشارة عرض على بيانات تجريبية ولا تُستخدم للتنفيذ."
          : ` الإشارة محسوبة من شموع Alpaca الفعلية${data.asOf ? ` حتى ${new Date(data.asOf).toLocaleString("ar-SA")}` : ""}، لكنها ليست توصية استثمارية.`}
      </p>
    </div>
  );
}
