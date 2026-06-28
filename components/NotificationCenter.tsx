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
        aria-label={`الإشعارات ${unreadCount > 0 ? `(${unreadCount} جديد)` : ""}`}
        aria-expanded={open}
      >
        <Bell size={18} />
        <span className="hide-mobile">الإشعارات</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-dropdown-header">
            <strong>الإشعارات ({unreadCount} جديد)</strong>
            <button
              className="notification-close"
              onClick={() => setOpen(false)}
              aria-label="إغلاق الإشعارات"
            >
              <X size={18} />
            </button>
          </div>

          {loading && notifications.length === 0 && (
            <div className="notification-empty">جاري التحميل...</div>
          )}

          {!loading && notifications.length === 0 && (
            <div className="notification-empty">لا توجد إشعارات</div>
          )}

          {notifications.map((n) => {
            const Icon = typeIcons[n.type] || Bell;
            return (
              <div
                key={n.id}
                className={`notification-item ${!n.readAt ? "unread" : ""}`}
              >
                <div className="notification-item-title">
                  <Icon size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                  <strong style={{ fontSize: "0.9rem" }}>{n.title}</strong>
                </div>
                <span className="notification-item-message">{n.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
