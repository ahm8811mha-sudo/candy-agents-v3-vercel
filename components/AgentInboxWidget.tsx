"use client";

import { Inbox } from "lucide-react";
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

  return (
    <div className="inbox-widget">
      <button className="primary-btn" onClick={() => setOpen(!open)}><Inbox size={17} /> الوارد ({items.length})</button>
      {open && (
        <div className="inbox-panel">
          <h3>نتائج الوكلاء والطلبات</h3>
          {items.length === 0 && (
            <div className="feed-item">
              <strong>لا توجد نتائج بعد</strong>
              <span>شغّل سلسلة الوكلاء أو أرسل طلبًا موحدًا لتظهر النتيجة هنا.</span>
            </div>
          )}
          <div className="feed">
            {items.map((item) => (
              <button key={item.id} className="secondary-btn inbox-item-button" onClick={() => setSelected(item.id)}>
                {item.resultTitle}
                <small>{new Date(item.createdAt).toLocaleString("ar-SA")}</small>
              </button>
            ))}
          </div>
          {current && (
            <div className="feed-item" style={{ marginTop: 12 }}>
              <strong>{current.resultTitle}</strong>
              <span>{current.requestText}</span>
              <pre>{current.resultContent}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
