"use client";

import { Mail } from "lucide-react";
import OrvantaLogo from "@/components/OrvantaLogo";
import MailCenterApiPanel from "@/components/MailCenterApiPanel";

export default function CorrespondenceCenterPage() {
  return (
    <main className="page-wrap">
      <section className="hero-scenic" style={{ textAlign: "start", justifyItems: "stretch" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <OrvantaLogo size={54} subtitle="Correspondence Center" />
          <span className="hero-pill"><Mail size={14} /> مركز المخاطبات · بريد شركة</span>
        </div>
        <h1 className="hero-title" style={{ maxWidth: "none" }}>مركز بريد حقيقي للشركة<br />وارد وصادر ومسودات و<em>اعتماد رسمي</em></h1>
        <p className="hero-sub" style={{ maxWidth: 820 }}>تم تجهيز المركز ليعمل عبر API وقاعدة بيانات Supabase، ويرسل عبر Resend عند إضافة المفاتيح في Vercel.</p>
      </section>
      <MailCenterApiPanel />
    </main>
  );
}
