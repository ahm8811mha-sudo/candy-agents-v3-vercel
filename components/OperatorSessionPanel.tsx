"use client";

import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, Loader2, Monitor, Plus, Save } from "lucide-react";

type Session = {
  id: string;
  title: string;
  targetUrl: string;
  serviceName: string;
  operatorName: string;
  request: string;
  status: string;
  preparedFields: Array<{ label: string; value: string }>;
  checklist: Array<{ label: string; done: boolean }>;
  notes: string;
};

export default function OperatorSessionPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/operator-sessions", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) setSessions(json.sessions || []);
  }

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/operator-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        title: String(form.get("title") || ""),
        targetUrl: String(form.get("targetUrl") || ""),
        serviceName: String(form.get("serviceName") || ""),
        request: String(form.get("request") || ""),
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setSessions(json.sessions || []);
      setMessage("تم إنشاء جلسة تشغيل مراقبة.");
      event.currentTarget.reset();
    } else {
      setMessage(json.error || "تعذر إنشاء الجلسة.");
    }
    setWorking(false);
  }

  async function updateSession(session: Session) {
    setWorking(true);
    const res = await fetch("/api/operator-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", id: session.id, status: session.status, notes: session.notes, checklist: session.checklist, preparedFields: session.preparedFields }),
    });
    const json = await res.json();
    if (json.ok) {
      setSessions(json.sessions || []);
      setMessage("تم حفظ حالة الجلسة.");
    }
    setWorking(false);
  }

  async function startRemote(session: Session) {
    setWorking(true);
    const res = await fetch("/api/browser-runner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", sessionId: session.id, targetUrl: session.targetUrl, title: session.title }),
    });
    const json = await res.json();
    setMessage(json.ok ? "تم إرسال الجلسة للـ Remote Runner." : json.error || "الـ Remote Runner غير جاهز.");
    setWorking(false);
  }

  function patchLocal(id: string, updater: (session: Session) => Session) {
    setSessions((old) => old.map((session) => (session.id === id ? updater(session) : session)));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="ops-card executive-brief">
      <span className="eyebrow">Browser Agent · Phase 2/3</span>
      <h2>جلسات تشغيل مراقبة</h2>
      <p className="muted">أنشئ جلسة، افتح الرابط، جهز القيم، واحفظ نقاط المراجعة. عند ضبط BROWSER_RUNNER_URL يمكن إرسال الجلسة للـ Remote Runner.</p>

      <form className="inline-source-form" onSubmit={createSession}>
        <strong><Plus size={15} /> جلسة جديدة</strong>
        <input className="input" name="title" placeholder="مثلاً: تحديث بيانات الملف التجاري" />
        <input className="input" name="serviceName" placeholder="اسم الخدمة" defaultValue="تحديث بيانات الملف التجاري" />
        <input className="input" name="targetUrl" placeholder="الرابط الرسمي" defaultValue="https://gidentity.business.sa/Identity/Account/Login?LoginType=merchant" />
        <textarea className="textarea compact" name="request" placeholder="اكتب المطلوب من ماجد" defaultValue="جهز بيانات الملف التجاري، ثم تابع التعبئة مع مراجعة صاحب الصلاحية قبل الإنهاء النهائي." />
        <button className="secondary-btn" disabled={working}>{working ? <Loader2 className="spin" size={15} /> : <Plus size={15} />} إنشاء</button>
      </form>

      {message && <p className="notice done">{message}</p>}

      <div className="statement-list">
        {sessions.map((session) => (
          <article className="statement-row action" key={session.id}>
            <span style={{ display: "grid", gap: 10, width: "100%" }}>
              <b>{session.title}</b>
              <small>{session.operatorName} · {session.serviceName} · {session.status}</small>
              <div className="form-command-row">
                <a className="secondary-btn" href={session.targetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> فتح الرابط</a>
                <button className="secondary-btn" type="button" onClick={() => startRemote(session)} disabled={working}><Monitor size={15} /> إرسال للـ Runner</button>
              </div>
              <select className="input" value={session.status} onChange={(e) => patchLocal(session.id, (s) => ({ ...s, status: e.target.value }))}>
                <option value="READY">جاهزة</option>
                <option value="OPENED">تم فتح الرابط</option>
                <option value="FILLING">قيد التعبئة</option>
                <option value="REVIEW">بانتظار مراجعة</option>
                <option value="DONE">منتهية</option>
                <option value="BLOCKED">متوقفة</option>
              </select>
              <div className="statement-list">
                {session.checklist.map((item, index) => (
                  <label className="statement-row action" key={item.label}>
                    <input type="checkbox" checked={item.done} onChange={(e) => patchLocal(session.id, (s) => ({ ...s, checklist: s.checklist.map((row, i) => (i === index ? { ...row, done: e.target.checked } : row)) }))} />
                    <span><b>{item.label}</b><small>{item.done ? "Done" : "Pending"}</small></span>
                  </label>
                ))}
              </div>
              <div className="statement-list">
                {session.preparedFields.map((field, index) => (
                  <label key={`${field.label}-${index}`}>
                    {field.label}
                    <textarea className="textarea compact" value={field.value} onChange={(e) => patchLocal(session.id, (s) => ({ ...s, preparedFields: s.preparedFields.map((row, i) => (i === index ? { ...row, value: e.target.value } : row)) }))} />
                  </label>
                ))}
              </div>
              <textarea className="textarea compact" value={session.notes} onChange={(e) => patchLocal(session.id, (s) => ({ ...s, notes: e.target.value }))} />
              <button className="primary-btn" type="button" onClick={() => updateSession(session)} disabled={working}>{working ? <Loader2 className="spin" size={15} /> : <Save size={15} />} حفظ الجلسة</button>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
