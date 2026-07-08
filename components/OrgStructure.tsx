"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Crown,
  ShieldCheck,
  Users,
  Loader2,
  BadgeCheck,
  ArrowLeft,
  Pencil,
  Check,
  RotateCcw,
  Power,
} from "lucide-react";

type Agent = {
  id: string;
  name: string;
  title: string;
  rank: "OWNER" | "CEO" | "DEPARTMENT_HEAD" | "FUNCTIONAL";
  department: string;
  href?: string;
  responsibilities: string[];
  authorityLimitSAR: number;
  reportsTo: string | null;
  active?: boolean;
  customized?: boolean;
};

type TierRule = {
  tier: string;
  maxSAR: number | null;
  approver: string;
  label: string;
  note: string;
};

const sar = new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 });

const rankMeta: Record<Agent["rank"], { label: string; icon: typeof Crown }> = {
  OWNER: { label: "السلطة العليا", icon: Crown },
  CEO: { label: "الإدارة التنفيذية", icon: ShieldCheck },
  DEPARTMENT_HEAD: { label: "رئيس قسم", icon: Building2 },
  FUNCTIONAL: { label: "وحدة مساندة", icon: Users },
};

function AgentCard({
  agent,
  onCustomize,
}: {
  agent: Agent;
  onCustomize: (input: { agentId: string; name?: string; title?: string; active?: boolean; action?: string }) => Promise<void>;
}) {
  const Icon = rankMeta[agent.rank].icon;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const [title, setTitle] = useState(agent.title);
  const [busy, setBusy] = useState(false);
  const editable = agent.rank !== "OWNER";
  const inactive = agent.active === false;

  async function save() {
    setBusy(true);
    try {
      await onCustomize({ agentId: agent.id, name, title });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const card = (
    <article className="bento-card" style={{ height: "100%", opacity: inactive ? 0.55 : 1 }}>
      <span className="bento-kicker" style={{ display: "flex", alignItems: "center" }}>
        <Icon size={15} /> {rankMeta[agent.rank].label} · {agent.department}
        {editable && (
          <button
            className="secondary-btn btn-sm"
            style={{ marginInlineStart: "auto", padding: "3px 8px" }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditing((v) => !v);
              setName(agent.name);
              setTitle(agent.title);
            }}
            aria-label="تخصيص الوكيل"
          >
            <Pencil size={12} />
          </button>
        )}
      </span>

      {editing ? (
        <div style={{ display: "grid", gap: 8 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الوكيل" aria-label="اسم الوكيل" />
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="المسمى الوظيفي" aria-label="المسمى الوظيفي" />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="primary-btn btn-sm" disabled={busy} onClick={save}>
              {busy ? <Loader2 className="spin" size={13} /> : <Check size={13} />} حفظ
            </button>
            <button
              className="secondary-btn btn-sm"
              disabled={busy}
              onClick={() => onCustomize({ agentId: agent.id, active: inactive })}
              title={inactive ? "تفعيل الوكيل" : "إيقاف الوكيل مؤقتاً"}
            >
              <Power size={13} /> {inactive ? "تفعيل" : "إيقاف"}
            </button>
            {agent.customized && (
              <button className="secondary-btn btn-sm" disabled={busy} onClick={() => onCustomize({ agentId: agent.id, action: "reset" })}>
                <RotateCcw size={13} /> افتراضي
              </button>
            )}
          </div>
        </div>
      ) : (
        <div>
          <strong style={{ fontSize: "1.15rem", color: "var(--text-strong)" }}>
            {agent.name}
            {agent.customized && <span className="mini-pill" style={{ marginInlineStart: 8 }}>مخصّص</span>}
            {inactive && <span className="mini-pill high" style={{ marginInlineStart: 6 }}>موقوف</span>}
          </strong>
          <div style={{ color: "var(--muted)", fontSize: "0.82rem", fontWeight: 800, marginTop: 2 }}>{agent.title}</div>
        </div>
      )}

      <ul style={{ margin: 0, paddingInlineStart: 18, display: "grid", gap: 4 }}>
        {agent.responsibilities.map((r) => (
          <li key={r} style={{ color: "var(--muted)", fontSize: "0.8rem", lineHeight: 1.7 }}>{r}</li>
        ))}
      </ul>
      <span className="bento-foot" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <BadgeCheck size={13} />
        {agent.rank === "OWNER"
          ? "صلاحية غير محدودة"
          : agent.authorityLimitSAR > 0
            ? `صلاحية ذاتية حتى ${sar.format(agent.authorityLimitSAR)}`
            : "بدون صلاحية صرف ذاتية"}
        {agent.href && <ArrowLeft size={13} style={{ marginInlineStart: "auto" }} />}
      </span>
    </article>
  );

  return agent.href && !editing ? (
    <Link href={agent.href} style={{ color: "inherit", textDecoration: "none", display: "block", height: "100%" }}>
      {card}
    </Link>
  ) : (
    card
  );
}

export default function OrgStructure() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [matrix, setMatrix] = useState<TierRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/company/org", { cache: "no-store" });
      const json = await res.json();
      if (json.ok) {
        setAgents(json.agents || []);
        setMatrix(json.matrix || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const customize = useCallback(
    async (input: { agentId: string; name?: string; title?: string; active?: boolean; action?: string }) => {
      setError(null);
      try {
        const res = await fetch("/api/company/org", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const json = await res.json();
        if (json.ok) setAgents(json.agents || []);
        else setError(json.error || "تعذّر حفظ التخصيص");
      } catch {
        setError("تعذّر الاتصال بالخادم");
      }
    },
    []
  );

  if (loading) {
    return (
      <main className="page-wrap" style={{ placeItems: "center" }}>
        <Loader2 className="spin" size={26} style={{ color: "var(--muted)" }} />
      </main>
    );
  }

  const leadership = agents.filter((a) => a.rank === "OWNER" || a.rank === "CEO");
  const heads = agents.filter((a) => a.rank === "DEPARTMENT_HEAD");
  const functional = agents.filter((a) => a.rank === "FUNCTIONAL");

  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Building2 size={16} /> شركة النجمة الذهبية</span>
          <h1 className="glow-title">الهيكل الإداري والحوكمة</h1>
          <p className="page-sub">
            هذا ليس مخططاً توضيحياً — إنه السجل الرسمي الذي يفرضه النظام: كل وكيل باسمه ومسؤولياته
            وحدود صلاحيته المالية، ومصفوفة الاعتماد التي لا تُتجاوز. تقدر تعيد تسمية أي وكيل أو
            توقفه مؤقتاً (✏️) — أما الرتب والصلاحيات فمحكومة بالمصفوفة ولا تُعدَّل.
          </p>
        </div>
      </header>

      {error && <p className="notice" style={{ color: "var(--red)" }}>{error}</p>}

      <section style={{ display: "grid", gap: 10 }}>
        <strong className="shell-group" style={{ padding: 0 }}>القيادة</strong>
        <div className="bento-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          {leadership.map((a) => <AgentCard key={a.id} agent={a} onCustomize={customize} />)}
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <strong className="shell-group" style={{ padding: 0 }}>رؤساء الأقسام (يرفعون لسلطان)</strong>
        <div className="bento-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          {heads.map((a) => <AgentCard key={a.id} agent={a} onCustomize={customize} />)}
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        <strong className="shell-group" style={{ padding: 0 }}>الوحدات المساندة</strong>
        <div className="bento-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          {functional.map((a) => <AgentCard key={a.id} agent={a} onCustomize={customize} />)}
        </div>
      </section>

      <section className="bento-card bento-full" style={{ gap: 12 }}>
        <span className="bento-kicker"><ShieldCheck size={15} /> مصفوفة الصلاحيات المالية — مُطبَّقة برمجياً</span>
        <div className="bento-list">
          {matrix.map((r) => (
            <div key={r.tier} className="bento-list__row" style={{ alignItems: "flex-start" }}>
              <span>
                <b style={{ color: "var(--text-strong)" }}>{r.tier}</b> · {r.label}
                <br />
                <small>{r.note}</small>
              </span>
              <span style={{ textAlign: "start", whiteSpace: "nowrap" }}>
                <b style={{ color: "var(--text-strong)", fontVariantNumeric: "tabular-nums" }}>
                  {r.maxSAR === null ? "فوق 100,000 ر.س" : `حتى ${sar.format(r.maxSAR)}`}
                </b>
                <br />
                <small>{r.approver}</small>
              </span>
            </div>
          ))}
        </div>
        <span className="bento-foot">
          القاعدة: لا صرف بدون قيد محاسبي مرتبط بمشروع — وكل قرار يُسجَّل في سجل التدقيق (مَن، متى، لماذا، بأي صلاحية).
        </span>
      </section>
    </main>
  );
}
