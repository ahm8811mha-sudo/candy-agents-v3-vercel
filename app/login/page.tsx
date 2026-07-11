"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const destination = candidate?.startsWith("/") ? candidate : "/";
    setNextPath(destination);
    fetch("/api/auth", { cache: "no-store" })
      .then((response) => {
        if (response.ok) router.replace(destination);
      })
      .finally(() => setChecking(false));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", email, password }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر تسجيل الدخول.");
      router.replace(nextPath);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-wrap" style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingBlock: 32 }}>
      <section className="bento-card" style={{ width: "min(440px, 100%)", gap: 20, padding: "clamp(22px, 5vw, 38px)" }}>
        <div style={{ display: "grid", placeItems: "center", gap: 12, textAlign: "center" }}>
          <OrvantaLogo size={190} subtitle="AI Company Operating System" priority />
          <span className="mini-pill"><ShieldCheck size={13} /> دخول مؤسسي آمن</span>
          <div>
            <h1 style={{ marginBottom: 8 }}>تسجيل الدخول إلى Orvanta</h1>
            <p className="page-sub" style={{ margin: 0 }}>ادخل بحسابك المعتمد للوصول إلى قرارات وبيانات شركتك فقط.</p>
          </div>
        </div>

        {checking ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}>
            <Loader2 className="spin" size={24} />
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 7 }}>
              <span style={{ fontWeight: 700 }}>البريد الإلكتروني</span>
              <input
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                dir="ltr"
              />
            </label>

            <label style={{ display: "grid", gap: 7 }}>
              <span style={{ fontWeight: 700 }}>كلمة المرور</span>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                dir="ltr"
              />
            </label>

            {error && <div className="notice" style={{ color: "var(--red)" }}>{error}</div>}

            <button className="primary-btn" type="submit" disabled={loading} style={{ justifyContent: "center", minHeight: 48 }}>
              {loading ? <Loader2 className="spin" size={17} /> : <LogIn size={17} />}
              دخول
            </button>
          </form>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--muted)", fontSize: ".8rem", lineHeight: 1.7 }}>
          <LockKeyhole size={15} style={{ flex: "0 0 auto", marginTop: 3 }} />
          <span>تُحفظ الجلسة في ملفات ارتباط HttpOnly مشفرة، ولا تُعرض رموز الدخول داخل JavaScript أو واجهة المستخدم.</span>
        </div>
      </section>
    </main>
  );
}
