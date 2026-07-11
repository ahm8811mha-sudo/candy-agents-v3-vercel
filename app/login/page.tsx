"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Crown,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

type SetupState = "FIRST_OWNER_SETUP" | "SETUP_IN_PROGRESS" | "READY" | "UNAVAILABLE";

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [setupState, setSetupState] = useState<SetupState>("UNAVAILABLE");
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("مساحتي الخاصة");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const firstOwnerSetup = setupState === "FIRST_OWNER_SETUP";
  const ownerSetupBusy = setupState === "SETUP_IN_PROGRESS";

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
        setSetupState(String(json.setupState || "UNAVAILABLE") as SetupState);
      })
      .catch(() => setSetupState("UNAVAILABLE"))
      .finally(() => setChecking(false));
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (firstOwnerSetup && password !== confirmPassword) {
      setLoading(false);
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    if (ownerSetupBusy) {
      setLoading(false);
      setError("توجد عملية إعداد للمالك قيد التنفيذ. انتظر قليلًا ثم أعد فتح الصفحة.");
      return;
    }

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: firstOwnerSetup ? "register_owner" : "login",
          name,
          workspaceName,
          email,
          password,
          rememberDevice: true,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر إكمال الدخول.");

      if (json.authenticated) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (json.requiresLogin) {
        setSetupState("READY");
        setConfirmPassword("");
        setMessage("تم إنشاء حساب المالك. أدخل كلمة المرور مرة أخرى لإكمال الدخول.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إكمال الدخول.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="page-wrap"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingBlock: 20 }}
    >
      <section
        className="bento-card"
        style={{ width: "min(620px, 100%)", gap: 20, padding: "clamp(20px, 4vw, 34px)" }}
      >
        <div style={{ display: "grid", placeItems: "center", gap: 10, textAlign: "center" }}>
          <OrvantaLogo size={132} subtitle="AI Company Operating System" priority />
          <span className="mini-pill"><Crown size={13} /> نسخة المالك الخاصة</span>
          <div>
            <h1 style={{ marginBottom: 8, fontSize: "clamp(1.65rem, 5vw, 2.35rem)" }}>
              {firstOwnerSetup ? "إعداد نسختك الخاصة" : "دخول المالك"}
            </h1>
            <p className="page-sub" style={{ margin: 0, maxWidth: 520 }}>
              هذه النسخة مخصصة لك وحدك حاليًا. تم إيقاف تسجيل الشركات والموظفين والدعوات إلى حين إطلاق Orvanta تجاريًا.
            </p>
          </div>
        </div>

        <div
          className="notice"
          style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "var(--text)", background: "rgba(47, 111, 237, .08)" }}
        >
          <ShieldCheck size={19} style={{ flex: "0 0 auto", marginTop: 3 }} />
          <div>
            <strong>دخول خاص وآمن للمالك فقط</strong>
            <div style={{ color: "var(--muted)", marginTop: 3, lineHeight: 1.75 }}>
              بعد نجاح الدخول يُعتمد هذا الجهاز تلقائيًا لمدة تصل إلى سنة، ويعيد Orvanta فتح جلستك دون عرض واجهة التسجيل في كل زيارة.
            </div>
          </div>
        </div>

        {checking ? (
          <div style={{ display: "grid", placeItems: "center", minHeight: 210 }}>
            <Loader2 className="spin" size={28} />
          </div>
        ) : setupState === "UNAVAILABLE" ? (
          <div className="notice" style={{ color: "var(--red)", lineHeight: 1.8 }}>
            تعذر التحقق من إعداد حساب المالك. أعد تحميل الصفحة بعد اكتمال النشر.
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
            {firstOwnerSetup && (
              <>
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

                <label style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontWeight: 700 }}>اسم المساحة الخاصة</span>
                  <input
                    className="input"
                    type="text"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="مساحتي الخاصة"
                  />
                </label>
              </>
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
                placeholder="owner@example.com"
                dir="ltr"
              />
            </label>

            <label style={{ display: "grid", gap: 7 }}>
              <span style={{ fontWeight: 700 }}>كلمة المرور</span>
              <input
                className="input"
                type="password"
                autoComplete={firstOwnerSetup ? "new-password" : "current-password"}
                minLength={firstOwnerSetup ? 10 : undefined}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••••"
                dir="ltr"
              />
              {firstOwnerSetup && <small style={{ color: "var(--muted)" }}>10 أحرف على الأقل.</small>}
            </label>

            {firstOwnerSetup && (
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

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: 12,
                borderRadius: 14,
                border: "1px solid var(--line)",
                background: "rgba(15, 23, 42, .025)",
              }}
            >
              <CheckCircle2 size={18} style={{ flex: "0 0 auto", marginTop: 3, color: "var(--blue)" }} />
              <span>
                <strong>هذا الجهاز موثوق تلقائيًا</strong>
                <small style={{ display: "block", color: "var(--muted)", marginTop: 3, lineHeight: 1.65 }}>
                  لن تظهر لك خيارات موظف أو شركة أو دعوة، ولن يملك أي حساب آخر صلاحية الدخول إلى النظام.
                </small>
              </span>
            </div>

            {ownerSetupBusy && (
              <div className="notice" style={{ color: "var(--red)" }}>
                توجد عملية إعداد قيد التنفيذ. يعاد فتحها تلقائيًا بعد انتهاء مهلة الأمان.
              </div>
            )}
            {message && <div className="notice done"><CheckCircle2 size={16} /> {message}</div>}
            {error && <div className="notice" style={{ color: "var(--red)" }}>{error}</div>}

            <button
              className="primary-btn"
              type="submit"
              disabled={loading || ownerSetupBusy}
              style={{ justifyContent: "center", minHeight: 54 }}
            >
              {loading ? <Loader2 className="spin" size={18} /> : firstOwnerSetup ? <UserPlus size={18} /> : <LogIn size={18} />}
              {firstOwnerSetup ? "إنشاء حسابي الخاص والدخول" : "دخول إلى Orvanta"}
            </button>
          </form>
        )}

        <div style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "var(--muted)", fontSize: ".82rem", lineHeight: 1.7 }}>
          <LockKeyhole size={15} style={{ flex: "0 0 auto", marginTop: 4 }} />
          <span>الجلسة محفوظة في ملفات ارتباط HttpOnly آمنة. الواجهة التجارية متعددة الشركات مؤجلة وليست متاحة في هذه النسخة.</span>
        </div>
      </section>
    </main>
  );
}
