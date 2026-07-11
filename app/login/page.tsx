"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    const candidate = new URLSearchParams(window.location.search).get("next");
    const destination = candidate?.startsWith("/") && candidate !== "/login" ? candidate : "/";
    router.replace(destination);
    router.refresh();
  }, [router]);

  return (
    <main
      className="page-wrap"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", paddingBlock: 20 }}
    >
      <section
        className="bento-card"
        style={{ width: "min(520px, 100%)", gap: 18, padding: "clamp(24px, 5vw, 40px)", textAlign: "center" }}
      >
        <div style={{ display: "grid", placeItems: "center", gap: 14 }}>
          <OrvantaLogo size={132} subtitle="AI Company Operating System" priority />
          <span className="mini-pill">نسخة المالك الخاصة</span>
          <h1 style={{ margin: 0, fontSize: "clamp(1.55rem, 5vw, 2.2rem)" }}>جارٍ فتح Orvanta</h1>
          <p className="page-sub" style={{ margin: 0 }}>
            تم تعطيل شاشة تسجيل الدخول في النسخة الشخصية الحالية.
          </p>
          <Loader2 className="spin" size={28} />
        </div>
      </section>
    </main>
  );
}
