"use client";

import { useEffect, useState } from "react";
import { Wallet, Loader2, ArrowDownToLine, ArrowUpFromLine, Info, ExternalLink, CheckCircle2, CircleDashed, ShieldCheck } from "lucide-react";

type Account = {
  mode: "paper" | "live";
  equity: number;
  cash: number;
  buyingPower: number;
  status: string;
  tradingBlocked: boolean;
  accountBlocked: boolean;
};

type Response = {
  ok: boolean;
  configured: boolean;
  mode: "paper" | "live";
  liveRequested?: boolean;
  liveEnabled?: boolean;
  missingEnvironmentVariables?: string[];
  symbol?: string;
  feed?: string;
  deployment?: { environment: string; isPreview: boolean; productionUrl?: string | null };
  account?: Account;
  error?: string;
};

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AccountPanel() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const res = await fetch("/api/trading/account", { cache: "no-store", signal });
      const json = await res.json();
      setData(json);
    } catch {
      if (signal?.aborted) return;
      setData({ ok: false, configured: false, mode: "paper", error: "تعذّر الاتصال بخدمة مركز التداول." });
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const isLive = data?.account?.mode === "live";
  const connected = Boolean(data?.configured && data.account && !data.error);

  return (
    <div className="delivery-panel fade-in trading-account-panel" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header trading-panel-header">
        <div>
          <span className="eyebrow"><Wallet size={16} /> حساب التداول</span>
          <h2>الرصيد وحالة الوسيط</h2>
        </div>
        <div className="trading-header-actions">
          {data && (
            <span className={`status-pill ${connected ? "done" : ""}`}>
              {connected ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
              {connected ? (isLive ? "حقيقي Live" : "ورقي Paper") : "بانتظار الربط"}
            </span>
          )}
          <button className="secondary-btn" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="spin" size={16} /> : "تحديث"}
          </button>
        </div>
      </div>

      {loading && !data && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
        </div>
      )}

      {data && !data.configured && (
        <div className="trading-setup-card">
          <div className="trading-setup-card__title">
            <ShieldCheck size={24} />
            <div>
              <strong>تهيئة Alpaca Paper مطلوبة</strong>
              <span>الربط الورقي يستخدم أموالاً افتراضية وبيانات IEX، ولا يسمح بإيداع أو سحب حقيقي.</span>
            </div>
          </div>
          {data.deployment?.isPreview && (
            <p className="notice integration-notice warning">
              هذه نسخة Preview معزولة وقد لا تحتوي مفاتيح Production.
              {data.deployment.productionUrl && <> <a href={data.deployment.productionUrl}>افتح نسخة الإنتاج</a>.</>}
            </p>
          )}
          <ol className="trading-setup-steps">
            <li><b>1</b><span>أنشئ حساب Paper وولّد مفاتيحه من لوحة Alpaca.</span></li>
            <li><b>2</b><span>أضف المتغيرين في Vercel: <code>ALPACA_API_KEY</code> و <code>ALPACA_API_SECRET</code>.</span></li>
            <li><b>3</b><span>اترك <code>ALPACA_LIVE=false</code> ثم أعد النشر واضغط تحديث.</span></li>
          </ol>
          <div className="inbox-item__actions">
            <a className="primary-btn btn-sm" href="https://app.alpaca.markets/" target="_blank" rel="noreferrer">
              فتح Alpaca Paper <ExternalLink size={14} />
            </a>
            <a className="secondary-btn btn-sm" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">
              متغيرات Vercel <ExternalLink size={14} />
            </a>
          </div>
          {data.missingEnvironmentVariables?.length ? (
            <small className="trading-missing">الناقص: {data.missingEnvironmentVariables.join("، ")}</small>
          ) : null}
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
            <p className="notice integration-notice" style={{ color: "var(--amber)" }}>
              <Info size={14} /> هذا حساب <b>ورقي</b> — الأرقام افتراضية ولا تمثّل أموالاً حقيقية. لا إيداع/سحب حقيقي.
            </p>
          )}
          {(data.account.tradingBlocked || data.account.accountBlocked) && (
            <p className="notice error">الحساب متصل لكن Alpaca يمنع التداول حالياً. راجع حالة الحساب من لوحة الوسيط.</p>
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
                {isLive ? "يتم من لوحة الوسيط المرخّص فقط. التطبيق يعرض الرصيد ولا يحرّك الأموال." : "غير متاح في Paper؛ الرصيد افتراضي ويُدار من لوحة Alpaca التجريبية."}
              </small>
            </span>
            <ArrowDownToLine size={16} style={{ color: "var(--green)" }} />
          </div>
          <div className="statement-row">
            <span>
              <b style={{ color: "var(--text)" }}>السحب</b>
              <br />
              <small style={{ color: "var(--muted)" }}>
                {isLive ? "يُطلب من لوحة الوسيط فقط ويُحوّل إلى الحساب البنكي المسجل." : "غير متاح في Paper ولا توجد أموال حقيقية قابلة للسحب."}
              </small>
            </span>
            <ArrowUpFromLine size={16} style={{ color: "var(--amber)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
