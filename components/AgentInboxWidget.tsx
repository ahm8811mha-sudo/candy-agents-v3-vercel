"use client";

import { useEffect, useState } from "react";

type Item = { id: string; requestText: string; resultTitle: string; resultContent: string; status: string; createdAt: string };

export default function AgentInboxWidget() {
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/inbox", { cache: "no-store" });
    const data = await res.json();
    if (data.ok) setItems(data.items || []);
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 12000);
    return () => window.clearInterval(timer);
  }, []);

  const current = items.find((item) => item.id === selected) || items[0];

  return <div style={{ position: "fixed", left: 18, bottom: 18, zIndex: 50, direction: "rtl" }}>
    <button className="primary-btn" onClick={() => setOpen(!open)}>سجل الوارد ({items.length})</button>
    {open && <div className="card" style={{ width: 360, maxWidth: "calc(100vw - 36px)", maxHeight: "70vh", overflow: "auto", marginTop: 10 }}>
      <h3>سجل الوارد — نتائج الموظفين الذكيين</h3>
      {items.length === 0 && <div className="feed-item"><strong>لا توجد نتائج بعد</strong><span>أرسل طلبًا موحدًا وستظهر النتيجة هنا.</span></div>}
      <div className="feed">
        {items.map((item) => <button key={item.id} className="secondary-btn" style={{ textAlign: "right" }} onClick={() => setSelected(item.id)}>{item.resultTitle}<br/><small>{new Date(item.createdAt).toLocaleString("ar-SA")}</small></button>)}
      </div>
      {current && <div className="feed-item" style={{ marginTop: 12 }}>
        <strong>{current.resultTitle}</strong>
        <p style={{ color: "var(--muted)" }}>{current.requestText}</p>
        <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, fontFamily: "inherit" }}>{current.resultContent}</pre>
      </div>}
    </div>}
  </div>;
}
