"use client";

import { useState } from "react";
import { Crown, Loader2, LockKeyhole } from "lucide-react";

export default function SessionControl() {
  const [locking, setLocking] = useState(false);

  async function lockDevice() {
    setLocking(true);
    try {
      await fetch("/api/owner-access", { method: "DELETE" });
    } finally {
      window.location.assign("/login");
    }
  }

  return (
    <button
      type="button"
      className="mini-pill"
      onClick={lockDevice}
      disabled={locking}
      title="قفل النسخة الخاصة على هذا الجهاز"
      style={{ cursor: "pointer", border: "1px solid var(--line)" }}
    >
      {locking ? <Loader2 className="spin" size={12} /> : <Crown size={12} />}
      <span className="hide-mobile">نسختي الخاصة</span>
      <LockKeyhole size={12} />
    </button>
  );
}
