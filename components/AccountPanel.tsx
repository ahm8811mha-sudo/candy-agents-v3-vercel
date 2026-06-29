"use client";

import { useEffect, useState } from "react";
import { Wallet, Loader2, ArrowDownToLine, ArrowUpFromLine, Info } from "lucide-react";

type Account = {
  mode: "paper" | "live";
  equity: number;
  cash: number;
  buyingPower: number;
  status: string;
};

type Response = {
  ok: boolean;
  configured: boolean;
  mode?: string;
  account?: Account;
  error?: string;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AccountPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/trading/account", { cache: "no-store" });
      setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const isLive = data?.account?.mode === "live";

  return (
    <div className="delivery-panel fade-in" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><Wallet size={16} /> حساب التداول</span>
          <h2>الرصيد والإيرادات</h2>
        </div>
        {data?.configured && data.account && (
          <span className={`status-pill ${isLive ? "running" : "done"}`}>
            {isLive ? "حساب حقيقي (Live)" : "حساب ورقي (Paper)"}
          </span>
        )}
        <button className="secondary-btn" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : "تحديث"}
        </button>
      </div>

      {loading && !data && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {data && !data.configured && (
        <div className="empty-state" style={{ minHeight: 120 }}>
          <Wallet size={26} />
          <strong>Alpaca غير مُهيّأ</strong>
          <span>أضف <code>ALPACA_API_KEY</code> و <code>ALPACA_API_SECRET</code> في Vercel ثم أعد النشر لعرض رصيد حسابك.</span>
        </div>
      )}

      {data?.error && <p className="notice error">{data.error}</p>}

      {data?.account && (
        <>
          <div className="finance-summary">
            <div className="metric-card green">
              <small>إجمالي القيمة (Equity)</small>
              <strong>{usd.format(data.account.equity)}</strong>
            </div>
            <div className="metric-card">
              <small>النقد المتاح (Cash)</small>
              <strong>{usd.format(data.account.cash)}</strong>
            </div>
            <div className="metric-card">
              <small>القوة الشرائية</small>
              <strong>{usd.format(data.account.buyingPower)}</strong>
            </div>
          </div>

          {!isLive && (
            <p className="notice" style={{ color: "var(--amber)" }}>
              <Info size={14} /> هذا حساب <b>ورقي</b> — الأرقام افتراضية ولا تمثّل أموالاً حقيقية. لا إيداع/سحب حقيقي.
            </p>
          )}
        </>
      )}

      {/* Funding & withdrawal — honest broker-level explanation */}
      <div className="report-section-box">
        <div className="report-section-header">
          <ArrowDownToLine size={18} style={{ color: "var(--green)" }} />
          <strong>الإيداع والسحب</strong>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <div className="statement-row">
            <span>
              <b style={{ color: "var(--text)" }}>الإيداع</b>
              <br />
              <small style={{ color: "var(--muted)" }}>
                يتم من لوحة الوسيط المرخّص (Alpaca/وسيط سعودي) — تحويل بنكي إلى حساب الوساطة. التطبيق يعرض الرصيد فقط ولا يحرّك أموالاً.
              </small>
            </span>
            <ArrowDownToLine size={16} style={{ color: "var(--green)" }} />
          </div>
          <div className="statement-row">
            <span>
              <b style={{ color: "var(--text)" }}>السحب</b>
              <br />
              <small style={{ color: "var(--muted)" }}>
                يُطلب من لوحة الوسيط ويُحوَّل لحساب المؤسسة البنكي. يتطلب حساب Live مموّلاً (غير متاح على Paper).
              </small>
            </span>
            <ArrowUpFromLine size={16} style={{ color: "var(--amber)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
