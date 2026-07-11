"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LockKeyhole, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [mode, setMode] = useState<AuthMode>("login");
  const [registrationAvailable, setRegistrationAvailable] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const destination = candidate?.startsWith("/") ? candidate : "/";
    setNextPath(destination);

    fetch("/api/auth", { cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}));
        if (response.ok && json.authenticated) {
          router.replace(destination);
          return;
        }
        const available = Boolean(json.registrationAvailable);
        setRegistrationAvailable(available);
        if (available) setMode("register");
      })
      .finally(() => setChecking(false));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "register" && password !== confirmPassword) {
      setLoading(false);
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: mode === "register" ? "register" : "login",
          name,
          email,
          password,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.error || (mode === "register" ? "تعذر إنشاء الحساب." : "تعذر تسجيل الدخول."));
      }

      if (json.authenticated) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (json.requiresLogin) {
        setRegistrationAvailable(false);
        setMode("login");
        setConfirmPassword("");
        setMessage("تم إنشاء حساب المالك. أدخل كلمة المرور مرة أخرى لتسجيل الدخول.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إكمال العملية.");
    } finally {
      setLoading(false);
    }
  }

  const registering = mode === "register";

  return (
    <main className="page-wrap" style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingBlock: 32 }}>
      <section className="bento-card" style={{ width: "min(440px, 100%)", gap: 20, padding: "clamp(22px, 5vw, 38px)" }}>
        <div style={{ display: "grid", placeItems: "center", gap: 12, textAlign: "center" }}>
          <OrvantaLogo size={190} subtitle="AI Company Operating System" priority />
          <span className="mini-pill">
            <ShieldCheck size={13} />
            {registering ? "إعداد المالك الأول" : "دخول مؤسسي آمن"}
          </span>
          <div>
            <h1 style={{ marginBottom: 8 }}>
              {registering ? "إنشاء حساب مالك Orvanta" : "تسجيل الدخول إلى Orvanta"}
            </h1>
            <p className="page-sub" style={{ margin: 0 }}>
              {registering
                ? "لا يوجد حساب في النظام حتى الآن. أنشئ حساب المالك الأول، وبعدها يُغلق التسجيل العام تلقائيًا."
                : "ادخل بحسابك المعتمد للوصول إلى قرارات وبيانات شركتك فقط."}
            </p>
          </div>
        </div>

        {checking ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 160 }}>
            <Loader2 className="spin" size={24} />
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            {registering && (
              <label style={{ display: "grid", gap: 7 }}>
                <span style={{ fontWeight: 700 }}>اسم المالك</span>
                <input
                  className="input"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="الاسم الكامل"
                />
              </label>
            )}

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
                autoComplete={registering ? "new-password" : "current-password"}
                minLength={registering ? 10 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••"
                dir="ltr"
              />
              {registering && <small style={{ color: "var(--muted)" }}>10 أحرف على الأقل. لا ترسل كلمة المرور لأي شخص.</small>}
            </label>

            {registering && (
              <label style={{ display: "grid", gap: 7 }}>
                <span style={{ fontWeight: 700 }}>تأكيد كلمة المرور</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={10}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••••"
                  dir="ltr"
                />
              </label>
            )}

            {message && <div className="notice done">{message}</div>}
            {error && <div className="notice" style={{ color: "var(--red)" }}>{error}</div>}

            <button className="primary-btn" type="submit" disabled={loading} style={{ justifyContent: "center", minHeight: 48 }}>
              {loading ? <Loader2 className="spin" size={17} /> : registering ? <UserPlus size={17} /> : <LogIn size={17} />}
              {registering ? "إنشاء الحساب والدخول" : "دخول"}
            </button>

            {registrationAvailable && (
              <button
                className="secondary-btn"
                type="button"
                disabled={loading}
                onClick={() => {
                  setMode(registering ? "login" : "register");
                  setError("");
                  setMessage("");
                }}
                style={{ justifyContent: "center" }}
              >
                {registering ? "لدي حساب بالفعل" : "إنشاء حساب المالك لأول مرة"}
              </button>
            )}
          </form>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", color: "var(--muted)", fontSize: ".8rem", lineHeight: 1.7 }}>
          <LockKeyhole size={15} style={{ flex: "0 0 auto", marginTop: 3 }} />
          <span>
            {registering
              ? "هذا التسجيل متاح مرة واحدة فقط لإنشاء مالك النظام الأول. بعد الإنشاء، يضيف المالك بقية المستخدمين بصلاحيات محددة."
              : "تُحفظ الجلسة في ملفات ارتباط HttpOnly مشفرة، ولا تُعرض رموز الدخول داخل JavaScript أو واجهة المستخدم."}
          </span>
        </div>
      </section>
    </main>
  );
}
