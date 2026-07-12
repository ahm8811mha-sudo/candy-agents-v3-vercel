"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const destination = useMemo(() => {
    const candidate = searchParams.get("next");
    return candidate?.startsWith("/") && candidate !== "/login" ? candidate : "/";
  }, [searchParams]);

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
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر فتح النسخة الخاصة.");
    } finally {
      setLoading(false);
    }
  }

  const missingSetup = searchParams.get("setup") === "missing";

  return (
    <main className="page-wrap" style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingBlock: 20 }}>
      <section
        className="bento-card"
        style={{ width: "min(560px, 100%)", gap: 20, padding: "clamp(24px, 5vw, 40px)" }}
      >
        <div style={{ display: "grid", placeItems: "center", gap: 12, textAlign: "center" }}>
          <OrvantaLogo size={132} subtitle="AI Company Operating System" priority />
          <span className="mini-pill"><ShieldCheck size={13} /> نسخة المالك الخاصة</span>
          <h1 style={{ margin: 0, fontSize: "clamp(1.55rem, 5vw, 2.2rem)" }}>فتح Orvanta على هذا الجهاز</h1>
          <p className="page-sub" style={{ margin: 0, maxWidth: 470 }}>
            أدخل رمز المالك مرة واحدة فقط. بعد نجاح التحقق يُعتمد هذا الجهاز لمدة سنة ولا تتكرر شاشة الفتح.
          </p>
        </div>

        {missingSetup ? (
          <div className="notice" style={{ color: "var(--red)", lineHeight: 1.8 }}>
            لم تُجهز حماية النسخة الخاصة بعد. يجب تطبيق Migration الوصول وضبط مفتاح توقيع الخادم قبل فتح النظام.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 7 }}>
              <span style={{ fontWeight: 800 }}>رمز وصول المالك</span>
              <div style={{ position: "relative" }}>
                <KeyRound size={19} style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }} />
                <input
                  className="input"
                  type="password"
                  autoComplete="one-time-code"
                  required
                  minLength={12}
                  maxLength={80}
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="ORV-••••••••••••••••"
                  dir="ltr"
                  style={{ paddingRight: 48 }}
                />
              </div>
            </label>

            {error && <div className="notice" style={{ color: "var(--red)" }}>{error}</div>}

            <button className="primary-btn" type="submit" disabled={loading} style={{ justifyContent: "center", minHeight: 54 }}>
              {loading ? <Loader2 className="spin" size={18} /> : <LockKeyhole size={18} />}
              فتح النسخة الخاصة
            </button>
          </form>
        )}

        <div style={{ color: "var(--muted)", fontSize: ".82rem", lineHeight: 1.8, textAlign: "center" }}>
          الرمز لا يُحفظ داخل المتصفح. يُحفظ فقط ملف ارتباط HttpOnly موقّع لا يمكن لواجهة JavaScript قراءته.
        </div>
      </section>
    </main>
  );
}
