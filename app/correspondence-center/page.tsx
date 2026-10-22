"use client";

import MailCenterApiPanel from "@/components/MailCenterApiPanel";

export default function CorrespondenceCenterPage() {
  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <h1>المخاطبات</h1>
          <p className="page-sub">بريد الشركة الوارد والصادر والمسودات، والاعتماد الرسمي قبل أن تخرج أي رسالة.</p>
        </div>
      </header>
      <MailCenterApiPanel />
    </main>
  );
}
