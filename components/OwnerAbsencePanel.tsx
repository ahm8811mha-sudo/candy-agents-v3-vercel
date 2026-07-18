"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  LockKeyhole,
  PauseCircle,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type {
  AutonomousRiskLevel,
  OwnerAbsenceEffectiveStatus,
  OwnerAbsenceStatus,
} from "@/lib/company/ownerAbsencePolicy";

type OwnerAbsencePolicyView = {
  id?: string;
  status: OwnerAbsenceStatus;
  effectiveStatus: OwnerAbsenceEffectiveStatus;
  startsAt: string | null;
  endsAt: string | null;
  strategicGuidance: string;
  prohibitedActions: string[];
  routineAutoLimitSAR: number;
  executiveAgentLimitSAR: number;
  maxAutonomousRisk: AutonomousRiskLevel;
  allowExternalActions: boolean;
  requireCompletionEvidence: boolean;
  delegatedHumanName: string | null;
  delegatedHumanContact: string | null;
  dailyBriefHour: number;
  lastRunAt: string | null;
  policyVersion: string;
};

type ContinuityEvent = {
  id: string;
  event_type: string;
  decision: string;
  reason?: string | null;
  created_at: string;
};

type PolicyForm = Omit<OwnerAbsencePolicyView, "startsAt" | "endsAt" | "lastRunAt"> & {
  startsAt: string;
  endsAt: string;
  lastRunAt: string | null;
};

const statusCopy: Record<OwnerAbsenceEffectiveStatus, { label: string; tone: string }> = {
  INACTIVE: { label: "الوضع العادي", tone: "idle" },
  SCHEDULED: { label: "غياب مجدول", tone: "scheduled" },
  ACTIVE: { label: "استمرارية الغياب فعّالة", tone: "active" },
  PAUSED: { label: "التنفيذ الذاتي متوقف", tone: "paused" },
  EXPIRED: { label: "انتهت مدة الغياب", tone: "expired" },
};

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function formFromPolicy(policy: OwnerAbsencePolicyView): PolicyForm {
  return {
    ...policy,
    startsAt: toLocalInput(policy.startsAt),
    endsAt: toLocalInput(policy.endsAt),
  };
}

function eventLabel(eventType: string) {
  if (eventType === "OWNER_ABSENCE_SWEEP_COMPLETED") return "جولة استمرارية مكتملة";
  if (eventType === "AUTONOMOUS_ACTION_AUTHORIZED") return "إجراء ذاتي داخل الصلاحية";
  if (eventType === "ACTION_DEFERRED_TO_OWNER") return "إجراء محفوظ للمالك";
  if (eventType === "APPROVAL_DEFERRED_TO_OWNER") return "اعتماد محفوظ لقرار المالك";
  if (eventType === "EXECUTIVE_APPROVAL_AUTHORIZED") return "اعتماد تنفيذي داخل الميثاق";
  if (eventType === "OWNER_STRATEGIC_OVERRIDE") return "توجيه استراتيجي مباشر من المالك";
  if (eventType === "APPROVAL_REJECTED_DURING_ABSENCE") return "رفض يحافظ على الوضع القائم";
  if (eventType === "OWNER_ABSENCE_POLICY_UPDATED") return "تحديث الميثاق";
  return eventType.replaceAll("_", " ");
}

export default function OwnerAbsencePanel() {
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [events, setEvents] = useState<ContinuityEvent[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/company/owner-absence", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "تعذر تحميل ميثاق غياب المالك.");
      setForm(formFromPolicy(data.policy as OwnerAbsencePolicyView));
      setEvents(data.events || []);
      setCanManage(data.canManage === true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ميثاق غياب المالك.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const status = form ? statusCopy[form.effectiveStatus] : statusCopy.INACTIVE;
  const authorityRows = useMemo(() => form ? [
    { label: "تنفيذ داخلي روتيني", limit: `حتى ${form.routineAutoLimitSAR.toLocaleString("ar-SA")} ر.س`, result: "ينفذه الوكيل ويعيد الدليل" },
    { label: "قرار تنفيذي متوسط", limit: `حتى ${form.executiveAgentLimitSAR.toLocaleString("ar-SA")} ر.س`, result: "مراجعة وكيل CEO ثم التنفيذ" },
    { label: "استراتيجية أو مخاطرة عالية", limit: "دون سقف ذاتي", result: "يُحفظ في صندوق المالك" },
    { label: "التزام خارجي", limit: form.allowExternalActions ? "مسموح داخل الحدود" : "متوقف", result: form.allowExternalActions ? "بتدقيق وسجل أثر" : "ينتظر المالك" },
  ] : [], [form]);

  async function save(event?: FormEvent, statusOverride?: OwnerAbsenceStatus) {
    event?.preventDefault();
    if (!form || !canManage) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const statusToSave = statusOverride || form.status;
      const now = new Date().toISOString();
      const requestedEnd = toIso(form.endsAt);
      const response = await fetch("/api/company/owner-absence", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: statusToSave,
          startsAt: statusOverride === "ACTIVE" ? now : statusToSave === "ACTIVE" && !form.startsAt ? now : toIso(form.startsAt),
          endsAt: statusToSave === "ACTIVE" && requestedEnd && Date.parse(requestedEnd) <= Date.now() ? null : requestedEnd,
          strategicGuidance: form.strategicGuidance,
          prohibitedActions: form.prohibitedActions,
          routineAutoLimitSAR: Number(form.routineAutoLimitSAR),
          executiveAgentLimitSAR: Number(form.executiveAgentLimitSAR),
          maxAutonomousRisk: form.maxAutonomousRisk,
          allowExternalActions: form.allowExternalActions,
          requireCompletionEvidence: form.requireCompletionEvidence,
          delegatedHumanName: form.delegatedHumanName || null,
          delegatedHumanContact: form.delegatedHumanContact || null,
          dailyBriefHour: Number(form.dailyBriefHour),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "تعذر حفظ ميثاق الغياب.");
      setForm(formFromPolicy(data.policy as OwnerAbsencePolicyView));
      setMessage(statusToSave === "ACTIVE" ? "تم تفعيل طبقة الاستمرارية ضمن توجيه المالك." : "تم حفظ ميثاق غياب المالك.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ ميثاق الغياب.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !form) {
    return <section className="ops-card owner-absence-panel"><div className="owner-absence-loading"><RefreshCw className="spin" size={20} /> جارٍ تحميل طبقة الاستمرارية…</div></section>;
  }

  if (!form) {
    return <section className="ops-card owner-absence-panel"><p className="notice error">{error || "تعذر تحميل طبقة الاستمرارية."}</p><button className="secondary-btn btn-sm" type="button" onClick={() => void load()}><RefreshCw size={15} /> إعادة المحاولة</button></section>;
  }

  return (
    <section className="ops-card owner-absence-panel" id="owner-continuity" aria-labelledby="owner-continuity-title">
      <header className="owner-absence-panel__header">
        <div>
          <span className="eyebrow"><ShieldCheck size={16} /> ميثاق استمرارية الشركة</span>
          <h2 id="owner-continuity-title">طبقة غياب المالك</h2>
          <p>يستمر الوكلاء في التشغيل داخل الحدود المعتمدة، بينما تبقى الاستراتيجية والالتزامات الجوهرية من صلاحية المالك وحده.</p>
        </div>
        <div className={`owner-absence-status ${status.tone}`}><span /><strong>{status.label}</strong><small>{form.lastRunAt ? `آخر جولة ${new Date(form.lastRunAt).toLocaleString("ar-SA")}` : "لم تبدأ جولة غياب بعد"}</small></div>
      </header>

      {message && <p className="notice done">{message}</p>}
      {error && <p className="notice error">{error}</p>}

      <div className="owner-absence-authority">
        {authorityRows.map((row) => <article key={row.label}><strong>{row.label}</strong><b>{row.limit}</b><small>{row.result}</small></article>)}
      </div>

      <form className="owner-absence-form" onSubmit={(event) => void save(event)}>
        <div className="owner-absence-form__grid">
          <label>حالة الميثاق
            <select className="input" value={form.status} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, status: event.target.value as OwnerAbsenceStatus })}>
              <option value="INACTIVE">تشغيل عادي</option>
              <option value="SCHEDULED">غياب مجدول</option>
              <option value="ACTIVE">غياب فعّال</option>
              <option value="PAUSED">إيقاف التنفيذ الذاتي</option>
            </select>
          </label>
          <label><CalendarClock size={15} /> بداية الغياب
            <input className="input" type="datetime-local" value={form.startsAt} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
          </label>
          <label><CalendarClock size={15} /> نهاية الغياب
            <input className="input" type="datetime-local" value={form.endsAt} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
          </label>
          <label>حد التنفيذ الروتيني (ر.س)
            <input className="input" type="number" min="0" step="100" value={form.routineAutoLimitSAR} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, routineAutoLimitSAR: Number(event.target.value) })} />
          </label>
          <label>حد وكيل CEO (ر.س)
            <input className="input" type="number" min="0" step="100" value={form.executiveAgentLimitSAR} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, executiveAgentLimitSAR: Number(event.target.value) })} />
          </label>
          <label>أقصى مخاطرة ذاتية
            <select className="input" value={form.maxAutonomousRisk} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, maxAutonomousRisk: event.target.value as AutonomousRiskLevel })}>
              <option value="LOW">منخفضة فقط</option>
              <option value="MEDIUM">حتى متوسطة</option>
            </select>
          </label>
          <label><UserRound size={15} /> جهة الطوارئ البشرية
            <input className="input" value={form.delegatedHumanName || ""} disabled={!canManage || saving} placeholder="الاسم — دون صلاحية استراتيجية" onChange={(event) => setForm({ ...form, delegatedHumanName: event.target.value })} />
          </label>
          <label className="owner-absence-contact">وسيلة التواصل
            <input className="input" value={form.delegatedHumanContact || ""} disabled={!canManage || saving} placeholder="هاتف أو بريد للطوارئ" onChange={(event) => setForm({ ...form, delegatedHumanContact: event.target.value })} />
          </label>
        </div>

        <label className="owner-absence-guidance"><LockKeyhole size={16} /> التوجيه الاستراتيجي الثابت للمالك
          <textarea className="textarea compact" value={form.strategicGuidance} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, strategicGuidance: event.target.value })} />
          <small>الوكلاء ينفذون هذا التوجيه ولا يملكون تغييره أثناء غيابك.</small>
        </label>

        <div className="owner-absence-toggles">
          <label><input type="checkbox" checked={form.requireCompletionEvidence} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, requireCompletionEvidence: event.target.checked })} /><span><CheckCircle2 size={17} /><b>دليل إلزامي قبل إغلاق المهمة</b><small>لا تُعد المهمة مكتملة بلا نتيجة محفوظة.</small></span></label>
          <label><input type="checkbox" checked={form.allowExternalActions} disabled={!canManage || saving} onChange={(event) => setForm({ ...form, allowExternalActions: event.target.checked })} /><span><AlertTriangle size={17} /><b>السماح بالأثر الخارجي</b><small>البريد والدفع والتعاقد؛ يفضّل إبقاؤه متوقفًا.</small></span></label>
        </div>

        <div className="owner-absence-actions">
          <button className="primary-btn" type="submit" disabled={!canManage || saving}><Save size={17} /> {saving ? "جارٍ الحفظ…" : "حفظ الميثاق"}</button>
          {form.effectiveStatus !== "ACTIVE" && <button className="secondary-btn" type="button" disabled={!canManage || saving} onClick={() => void save(undefined, "ACTIVE")}><Activity size={17} /> تفعيل الآن</button>}
          {form.effectiveStatus === "ACTIVE" && <button className="secondary-btn" type="button" disabled={!canManage || saving} onClick={() => void save(undefined, "PAUSED")}><PauseCircle size={17} /> إيقاف مؤقت</button>}
          {form.status !== "INACTIVE" && <button className="secondary-btn" type="button" disabled={!canManage || saving} onClick={() => void save(undefined, "INACTIVE")}><ShieldCheck size={17} /> عودة المالك</button>}
          {!canManage && <small>قراءة فقط: التفعيل والتعديل محصوران بحساب المالك.</small>}
        </div>
      </form>

      <div className="owner-absence-events">
        <div><strong>سجل الاستمرارية</strong><button className="secondary-btn btn-sm" type="button" disabled={loading} onClick={() => void load()}><RefreshCw size={14} /> تحديث</button></div>
        {events.length === 0 ? <p>لا توجد أحداث غياب مسجلة بعد.</p> : events.slice(0, 6).map((event) => <article key={event.id}><span><Activity size={15} /></span><div><strong>{eventLabel(event.event_type)}</strong><small>{event.reason || event.decision}</small></div><time>{new Date(event.created_at).toLocaleString("ar-SA")}</time></article>)}
      </div>
    </section>
  );
}
