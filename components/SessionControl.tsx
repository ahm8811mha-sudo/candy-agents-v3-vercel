"use client";

import { useState } from "react";
import { Crown, Loader2, LockKeyhole } from "lucide-react";

export default function SessionControl() {
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState("");

  async function lockDevice() {
    setLocking(true);
    setError("");
    try {
      const response = await fetch("/api/owner-access", { method: "DELETE" });
      if (!response.ok) throw new Error("لم يتأكد قفل الجهاز. أعد المحاولة.");
      window.location.replace("/login");
    } catch { setError("تعذر قفل الجهاز؛ أعد المحاولة."); setLocking(false); }
  }

  return (
    <div className="session-control"><button
      type="button"
      className="mini-pill"
      onClick={lockDevice}
      disabled={locking}
      title="قفل النسخة الخاصة على هذا الجهاز"
      style={{ cursor: "pointer", border: "1px solid var(--line)" }}
    >
      {locking ? <Loader2 className="spin" size={12} /> : <Crown size={12} />}
      <span className="hide-mobile">قفل الجهاز</span>
      <LockKeyhole size={12} />
    </button>{error ? <small className="session-lock-error" role="alert">{error}</small> : null}</div>
  );
}
