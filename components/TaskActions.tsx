"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function TaskActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(status: string, progressPercent: number) {
    setBusy(true);
    try {
      await fetch("/api/tasks/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status, progressPercent }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
    <button className="secondary-btn" disabled={busy} onClick={() => update("IN_PROGRESS", 50)}>بدء التنفيذ</button>
    <button className="secondary-btn" disabled={busy} onClick={() => update("DONE", 100)}>إغلاق كمنجز</button>
    <button className="secondary-btn" disabled={busy} onClick={() => update("ARCHIVED", 100)}>أرشفة</button>
  </div>;
}
