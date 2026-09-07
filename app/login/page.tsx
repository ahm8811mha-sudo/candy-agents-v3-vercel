"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { safeInternalDestination } from "@/lib/security/navigation";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [destination, setDestination] = useState("/");
  const [missingSetup, setMissingSetup] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    setDestination(safeInternalDestination(searchParams.get("next")));
    setMissingSetup(searchParams.get("setup") === "missing");
    setReady(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/owner-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر فتح النسخة الخاصة.");
      // Cross the HttpOnly cookie boundary with a fresh navigation, including WebKit.
      window.location.replace(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فتح النسخة الخاصة.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="owner-entry">
      <aside className="entry-statement" aria-label="عن مساحة العمل">
        <div className="entry-wordmark"><strong>أورفانتا</strong><span dir="ltr">ORVANTA / BUSINESS OFFICE</span></div>
        <div className="entry-manifesto"><p>مساحة خاصة لإدارة شركتك</p><h2>فكرة تستحق.<br />قرار واضح.<br />عمل يتحقق.</h2></div>
        <ol className="entry-sequence"><li><span>01</span> دراسة مبنية على أدلة</li><li><span>02</span> قرار محفوظ بسياقه</li><li><span>03</span> تنفيذ مرتبط بنتيجة</li></ol>
      </aside>
      <section className="entry-access">
        <div className="entry-access-inner">
          <p className="eyebrow"><LockKeyhole size={15} aria-hidden="true" /> مكتب المالك / دخول خاص</p>
          <h1>فتح Orvanta على هذا الجهاز</h1>
          <p className="entry-intro">مرحباً بعودتك. أدخل رمز المالك للوصول إلى ملفات الشركة وقراراتها.</p>
          {missingSetup ? (
            <div className="workspace-notice is-error" role="alert">حماية النسخة الخاصة غير مهيأة على الخادم. يجب ضبط مفتاح وصول المالك قبل فتح النظام.</div>
          ) : (
            <form onSubmit={submit} className="entry-form">
              <label className="field-label" htmlFor="owner-code">رمز وصول المالك</label>
              <div className="entry-code">
                <KeyRound size={19} aria-hidden="true" />
                <input className="input" id="owner-code" name="owner-code" type="password" autoComplete="one-time-code" required maxLength={128} disabled={!ready || loading} value={code} onChange={(event) => setCode(event.target.value)} placeholder="رمز الوصول الخاص" dir="ltr" aria-describedby="entry-session-note" />
              </div>
              {error ? <div className="workspace-notice is-error" role="alert">{error}</div> : null}
              <button className="entry-submit" type="submit" disabled={!ready || loading}>{loading ? <Loader2 className="spin" size={18} /> : null}<span>{loading ? "جارٍ التحقق…" : "فتح النسخة الخاصة"}</span><ArrowLeft size={18} aria-hidden="true" /></button>
              <p id="entry-session-note" className="entry-session-note">يبقى هذا الجهاز معتمداً لمدة سنة. يمكنك قفله في أي وقت من داخل مساحة العمل.</p>
            </form>
          )}
          <footer className="entry-footer"><span>مكتب إدارة الأعمال</span><span>النجمة الذهبية</span></footer>
        </div>
      </section>
    </main>
  );
}
