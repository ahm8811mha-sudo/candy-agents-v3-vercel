"use client";

import { useState, useEffect } from "react";
import { Plug, CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Integration = {
  type: string;
  name: string;
  enabled: boolean;
  metadata?: { description?: string };
};

export default function IntegrationsPanel() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/integrations");
        const data = await res.json();
        if (data.ok) setIntegrations(data.integrations || []);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="delivery-panel" style={{ padding: 24, textAlign: "center" }}>
        <Loader2 className="spin" size={24} style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  return (
    <div className="delivery-panel" style={{ display: "grid", gap: 16 }}>
      <div className="delivery-header">
        <div>
          <span className="eyebrow"><Plug size={16} /> التكاملات الخارجية</span>
          <h2>الخدمات المتصلة</h2>
        </div>
        <span className="status-pill done">
          {integrations.filter((i) => i.enabled).length}/{integrations.length} متصلة
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {integrations.map((integration) => (
          <div
            key={integration.type}
            className="metric-card"
            style={{
              borderColor: integration.enabled ? "rgba(56, 211, 159, 0.3)" : "var(--line)",
              opacity: integration.enabled ? 1 : 0.6,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "0.95rem" }}>{integration.name}</strong>
              {integration.enabled ? (
                <CheckCircle2 size={18} style={{ color: "var(--green)" }} />
              ) : (
                <XCircle size={18} style={{ color: "var(--muted)" }} />
              )}
            </div>
            <small style={{ color: "var(--muted)", lineHeight: 1.6 }}>
              {integration.metadata?.description || integration.type}
            </small>
            <span
              className={`mini-pill ${integration.enabled ? "done" : "pending"}`}
              style={{ width: "fit-content" }}
            >
              {integration.enabled ? "متصل" : "غير متصل"}
            </span>
          </div>
        ))}
      </div>

      {integrations.length === 0 && (
        <div className="empty-state" style={{ minHeight: 120 }}>
          <Plug size={24} />
          <span>لا توجد تكاملات متاحة</span>
        </div>
      )}
    </div>
  );
}
