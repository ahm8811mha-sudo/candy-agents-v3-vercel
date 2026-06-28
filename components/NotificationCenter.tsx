"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, X, AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

type Notification = {
  id: string;
  title: string;
  message: string;
  type: "INFO" | "TASK" | "APPROVAL" | "WARNING" | "SYSTEM";
  readAt?: string;
  createdAt: string;
};

const typeIcons = {
  INFO: Info,
  TASK: CheckCircle2,
  APPROVAL: ShieldAlert,
  WARNING: AlertTriangle,
  SYSTEM: Bell,
};

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setNotifications(
          (data.notifications || data || []).slice(0, 20).map((n: Record<string, unknown>) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            type: n.type || "INFO",
            readAt: n.readAt || n.read_at,
            createdAt: n.createdAt || n.created_at,
          }))
        );
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="secondary-btn"
        onClick={() => {
          setOpen(!open);
          if (!open) loadNotifications();
        }}
        style={{ position: "relative" }}
      >
        <Bell size={18} />
        الإشعارات
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              left: -4,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: "var(--red)",
              color: "white",
              fontSize: "0.7rem",
              fontWeight: 900,
              display: "grid",
              placeItems: "center",
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: 380,
            maxHeight: 480,
            overflowY: "auto",
            background: "var(--panel)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            boxShadow: "var(--shadow)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 16px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <strong>الإشعارات ({unreadCount} جديد)</strong>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {loading && notifications.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              جاري التحميل...
            </div>
          )}

          {!loading && notifications.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              لا توجد إشعارات
            </div>
          )}

          {notifications.map((n) => {
            const Icon = typeIcons[n.type] || Bell;
            return (
              <div
                key={n.id}
                style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--line)",
                  background: n.readAt ? "transparent" : "rgba(47, 128, 237, 0.06)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                  <strong style={{ fontSize: "0.9rem" }}>{n.title}</strong>
                </div>
                <span style={{ color: "var(--muted)", fontSize: "0.85rem", lineHeight: 1.7 }}>
                  {n.message}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
