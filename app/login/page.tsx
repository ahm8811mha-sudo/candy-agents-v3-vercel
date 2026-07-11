"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  Crown,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogIn,
  ShieldCheck,
  Smartphone,
  TicketCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

type AuthMode = "owner" | "employee" | "company" | "invite";
type SetupState = "FIRST_OWNER_SETUP" | "SETUP_IN_PROGRESS" | "READY" | "UNAVAILABLE";

type ModeCard = {
  id: AuthMode;
  title: string;
  subtitle: string;
  icon: typeof Crown;
};

const MODES: ModeCard[] = [
  { id: "owner", title: "أنا المالك", subtitle: "مساحتي الخاصة ودخول سريع", icon: Crown },
  { id: "employee", title: "أنا موظف", subtitle: "دخول بحساب الشركة", icon: UserRound },
  { id: "company", title: "شركة جديدة", subtitle: "إنشاء مساحة برمز تفعيل", icon: Building2 },
  { id: "invite", title: "لدي دعوة", subtitle: "الانضمام برمز الشركة", icon: TicketCheck },
];

export default function LoginPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/");
  const [mode, setMode] = useState<AuthMode>("owner");
  const [setupState, setSetupState] = useState<SetupState>("UNAVAILABLE");
  const [name, setName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const firstOwnerSetup = setupState === "FIRST_OWNER_SETUP";
  const ownerSetupBusy = setupState === "SETUP_IN_PROGRESS";
  const registrationMode = (mode === "owner" && firstOwnerSetup) || mode === "company" || mode === "invite";

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
        const state = String(json.setupState || "UNAVAILABLE") as SetupState;
        setSetupState(state);
        if (state === "FIRST_OWNER_SETUP" || state === "SETUP_IN_PROGRESS") setMode("owner");
      })
      .catch(() => setSetupState("UNAVAILABLE"))
      .finally(() => setChecking(false));
  }, [router]);

  const heading = useMemo(() => {
    if (mode === "owner" && firstOwnerSetup) return "إعداد مساحة مالك Orvanta";
    if (mode === "owner") return "دخول المالك السريع";
    if (mode === "employee") return "دخول الموظف";
    if (mode === "company") return "إنشاء مساحة شركة جديدة";
    return "الانضمام إلى شركة قائمة";
  }, [mode, firstOwnerSetup]);

  const description = useMemo(() => {
    if (mode === "owner" && firstOwnerSetup) {
      return "أنشئ حساب المالك مرة واحدة. بعدها يبقى هذا الجهاز موثوقًا ويدخل إلى مساحتك تلقائيًا دون طلب كلمة المرور في كل زيارة.";
    }
    if (mode === "owner") {
      return "استخدم حساب المالك. عند تفعيل الجهاز الموثوق يستمر الدخول تلقائيًا حتى 180 يومًا.";
    }
    if (mode === "employee") {
      return "الموظفون لا يسجلون حسابات عامة؛ يدخلون بالحساب الذي أنشأته الشركة لهم.";
    }
    if (mode === "company") {
      return "هذا المسار مخصص لعميل اشترى Orvanta وحصل على رمز تفعيل. تُنشأ له مساحة مستقلة ومعزولة.";
    }
    return "أدخل رمز الدعوة الذي أصدره مالك أو مدير الشركة لإنشاء عضويتك داخل مساحتها.";
  }, [mode, firstOwnerSetup]);

  function resetFeedback(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (registrationMode && password !== confirmPassword) {
      setLoading(false);
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    if (mode === "owner" && ownerSetupBusy) {
      setLoading(false);
      setError("توجد عملية إعداد للمالك قيد التنفيذ. انتظر قليلًا ثم أعد فتح الصفحة.");
      return;
    }

    const action = mode === "owner"
      ? firstOwnerSetup ? "register_owner" : "login"
      : mode === "employee"
        ? "login"
        : mode === "company"
          ? "register_company"
          : "join_company";

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          name,
          workspaceName,
          companyName,
          email,
          password,
          activationCode,
          inviteCode,
          rememberDevice,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) throw new Error(json.error || "تعذر إكمال العملية.");

      if (json.authenticated) {
        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (json.requiresLogin) {
        setSetupState("READY");
        setMode("owner");
        setConfirmPassword("");
        setMessage("تم إنشاء الحساب بنجاح. أدخل كلمة المرور مرة أخرى لإكمال الدخول.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إكمال العملية.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-wrap" style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingBlock: 24 }}>
      <section className="bento-card" style={{ width: "min(760px, 100%)", gap: 22, padding: "clamp(20px, 4vw, 34px)" }}>
        <div style={{ display: "grid", placeItems: "center", gap: 10, textAlign: "center" }}>
          <OrvantaLogo size={136} subtitle="AI Company Operating System" priority />
          <span className="mini-pill"><ShieldCheck size={13} /> بوابة Orvanta المرنة</span>
          <div>
            <h1 style={{ marginBottom: 8, fontSize: "clamp(1.65rem, 5vw, 2.5rem)" }}>اختر طريقة الوصول</h1>
            <p className="page-sub" style={{ margin: 0, maxWidth: 620 }}>
              نسخة واحدة من Orvanta تدعم مساحتك الخاصة، شركات العملاء، والموظفين مع عزل كامل للبيانات.
            </p>
          </div>
        </div>

        <div
          className="notice"
          style={{ display: "flex", alignItems: "flex-start", gap: 10, color: "var(--text)", background: "rgba(53, 154, 194, .08)" }}
        >
          <Smartphone size={18} style={{ flex: "0 0 auto", marginTop: 3 }} />
          <div>
            <strong>وصول المالك بدون تكرار تسجيل الدخول</strong>
            <div style={{ color: "var(--muted)", marginTop: 3, lineHeight: 1.7 }}>
              لا يمكن فتح بيانات الشركة بلا إثبات هوية نهائيًا. لكن المالك يسجل مرة واحدة، ثم يحفظ Orvanta جلسة الجهاز الموثوق ويدخله تلقائيًا في الزيارات التالية.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
          {MODES.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => resetFeedback(item.id)}
                aria-pressed={active}
                style={{
                  textAlign: "right",
                  display: "grid",
                  gap: 7,
                  minHeight: 112,
                  padding: 14,
                  borderRadius: 18,
                  border: active ? "2px solid var(--blue)" : "1px solid var(--line)",
                  background: active ? "rgba(47, 111, 237, .09)" : "var(--card)",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <Icon size={21} />
                <strong>{item.title}</strong>
                <small style={{ color: "var(--muted)", lineHeight: 1.5 }}>{item.subtitle}</small>
              </button>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: "clamp(1.35rem, 4vw, 1.9rem)" }}>{heading}</h2>
            <p className="page-sub" style={{ margin: "6px 0 0" }}>{description}</p>
          </div>

          {checking ? (
            <div style={{ display: "grid", placeItems: "center", minHeight: 180 }}>
              <Loader2 className="spin" size={26} />
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
              {registrationMode && (
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontWeight: 700 }}>{mode === "invite" ? "اسم الموظف" : "اسم المالك"}</span>
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

              {mode === "owner" && firstOwnerSetup && (
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontWeight: 700 }}>اسم مساحتك الخاصة</span>
                  <input
                    className="input"
                    type="text"
                    value={workspaceName}
                    onChange={(event) => setWorkspaceName(event.target.value)}
                    placeholder="مثال: شركة أحمد الذكية"
                  />
                  <small style={{ color: "var(--muted)" }}>هذه هي نسختك الأساسية بصلاحية OWNER وليست مساحة موظف.</small>
                </label>
              )}

              {mode === "company" && (
                <>
                  <label style={{ display: "grid", gap: 7 }}>
                    <span style={{ fontWeight: 700 }}>اسم الشركة</span>
                    <input
                      className="input"
                      type="text"
                      required
                      value={companyName}
                      onChange={(event) => setCompanyName(event.target.value)}
                      placeholder="اسم الشركة المرخصة"
                    />
                  </label>
                  <label style={{ display: "grid", gap: 7 }}>
                    <span style={{ fontWeight: 700 }}>رمز تفعيل Orvanta</span>
                    <input
                      className="input"
                      type="text"
                      required
                      value={activationCode}
                      onChange={(event) => setActivationCode(event.target.value.toUpperCase())}
                      placeholder="ORV-XXXXXXXXXX"
                      dir="ltr"
                    />
                    <small style={{ color: "var(--muted)" }}>يُصدر الرمز بعد شراء النظام، ويُستخدم مرة واحدة لإنشاء مساحة الشركة المعزولة.</small>
                  </label>
                </>
              )}

              {mode === "invite" && (
                <label style={{ display: "grid", gap: 7 }}>
                  <span style={{ fontWeight: 700 }}>رمز دعوة الشركة</span>
                  <input
                    className="input"
                    type="text"
                    required
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                    placeholder="TEAM-XXXXXXXXXX"
                    dir="ltr"
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
                  autoComplete={registrationMode ? "new-password" : "current-password"}
                  minLength={registrationMode ? 10 : undefined}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••••"
                  dir="ltr"
                />
                {registrationMode && <small style={{ color: "var(--muted)" }}>10 أحرف على الأقل.</small>}
              </label>

              {registrationMode && (
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

              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid var(--line)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(event) => setRememberDevice(event.target.checked)}
                  style={{ marginTop: 4 }}
                />
                <span>
                  <strong>اعتبر هذا الجهاز موثوقًا</strong>
                  <small style={{ display: "block", color: "var(--muted)", marginTop: 3 }}>
                    يحفظ دخول المالك حتى 180 يومًا. لا تستخدمه على جهاز مشترك.
                  </small>
                </span>
              </label>

              {ownerSetupBusy && mode === "owner" && (
                <div className="notice" style={{ color: "var(--orange)" }}>
                  توجد عملية إعداد أخرى قيد التنفيذ حاليًا. يعاد فتح التسجيل تلقائيًا إذا لم تكتمل خلال 15 دقيقة.
                </div>
              )}
              {message && <div className="notice done"><CheckCircle2 size={16} /> {message}</div>}
              {error && <div className="notice" style={{ color: "var(--red)" }}>{error}</div>}

              <button
                className="primary-btn"
                type="submit"
                disabled={loading || (mode === "owner" && ownerSetupBusy)}
                style={{ justifyContent: "center", minHeight: 52 }}
              >
                {loading ? <Loader2 className="spin" size={18} /> : registrationMode ? <UserPlus size={18} /> : <LogIn size={18} />}
                {registrationMode ? "إنشاء الحساب والدخول" : "دخول"}
              </button>
            </form>
          )}
        </div>

        <div style={{ display: "grid", gap: 9, paddingTop: 4 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "var(--muted)", fontSize: ".82rem", lineHeight: 1.7 }}>
            <KeyRound size={15} style={{ flex: "0 0 auto", marginTop: 4 }} />
            <span><strong>أساس التسجيل:</strong> المالك الأول يجهز النسخة مرة واحدة، العميل يسجل برمز ترخيص، والموظف ينضم بدعوة من شركته.</span>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", color: "var(--muted)", fontSize: ".82rem", lineHeight: 1.7 }}>
            <LockKeyhole size={15} style={{ flex: "0 0 auto", marginTop: 4 }} />
            <span>تُحفظ الجلسة في ملفات ارتباط HttpOnly مشفرة، ولا تُعرض رموز الدخول داخل JavaScript أو واجهة المستخدم.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
