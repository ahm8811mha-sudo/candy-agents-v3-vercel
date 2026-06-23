"use client";

import { useEffect, useState } from "react";

type InboxItem = { id: string; requestText: string; resultTitle: string; resultContent: string; assignedAgent: string; status: string; createdAt: string };

export default function InboxPanel() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      const data = await res.json();
      if (data.ok) setItems(data.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return <section id="inbox" className="card" style={{ marginTop: 16 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
      <h3>سجل الوارد — نتائج الموظفين الذكيين</h3>
      <button className="secondary-btn" onClick={load}>{loading ? "تحديث..." : "تحديث الوارد"}</button>
    </div>
    <div className="feed">
      {items.length === 0 && <div className="feed-item"><strong>لا توجد نتائج بعد</strong><span>أرسل طلبًا موحدًا، وستظهر الخطة أو النتيجة هنا.</span></div>}
      {items.map((item) => <div className="feed-item" key={item.id}>
        <strong>{item.resultTitle}</strong>
        <span>{new Date(item.createdAt).toLocaleString("ar-SA")} · {item.status}</span>
        <p style={{ color: "var(--muted)", margin: "8px 0" }}>{item.requestText}</p>
        <button className="secondary-btn" onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? "إخفاء النتيجة" : "عرض النتيجة"}</button>
        {openId === item.id && <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.9, background: "rgba(255,255,255,.75)", border: "1px solid var(--line)", borderRadius: 16, padding: 14, overflow: "auto" }}>{item.resultContent}</pre>}
      </div>)}
    </div>
  </section>;
}
