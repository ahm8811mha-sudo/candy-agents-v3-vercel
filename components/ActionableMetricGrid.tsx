"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, ExternalLink, Inbox } from "lucide-react";
import Link from "next/link";

export type ItemContext = { requestedBy?: string; relatedTo?: string; origin?: string };
export type DrillItem = {
  id: string;
  title: string;
  subtitle?: string;
  context?: ItemContext;
  href?: string;
  openLabel?: string;
};
export type ActionableMetric = {
  key: string;
  icon: LucideIcon;
  label: string;
  value: number;
  sourceType: string;
  items: DrillItem[];
};

export default function ActionableMetricGrid({ metrics }: { metrics: ActionableMetric[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const activeMetric = metrics.find((metric) => metric.key === selected) || null;

  return (
    <>
      <section className="ops-metrics">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const isActive = selected === metric.key;
          return (
            <button
              key={metric.key}
              type="button"
              className="metric-card green department-link"
              onClick={() => setSelected(isActive ? null : metric.key)}
              aria-expanded={isActive}
            >
              <span><Icon size={20} /></span>
              <small>{metric.label}</small>
              <strong>{metric.value}</strong>
              <em className="metric-card__drill-label">
                {isActive ? "إخفاء" : "فتح التفاصيل"}
                <ChevronDown size={13} className={isActive ? "is-open" : ""} />
              </em>
            </button>
          );
        })}
      </section>

      {activeMetric && (
        <section className="ops-card metric-drilldown">
          <h2>{activeMetric.label} — العناصر ({activeMetric.items.length})</h2>
          {activeMetric.items.length === 0 && (
            <div className="empty-state metric-drilldown__empty">
              <Inbox size={26} />
              <span>لا توجد عناصر في هذا المؤشر حاليًا.</span>
            </div>
          )}
          <div className="metric-drilldown__list">
            {activeMetric.items.map((item) => (
              <article key={item.id} className="metric-drilldown__item">
                <div className="metric-drilldown__heading">
                  <div>
                    <strong>{item.title}</strong>
                    {item.subtitle && <small>{item.subtitle}</small>}
                  </div>
                  {item.href && (
                    <Link className="secondary-btn btn-sm" href={item.href}>
                      {item.openLabel || "فتح المصدر"} <ExternalLink size={14} />
                    </Link>
                  )}
                </div>
                {item.context && (item.context.requestedBy || item.context.relatedTo || item.context.origin) && (
                  <dl className="metric-drilldown__context">
                    {item.context.requestedBy && <div><dt>المصدر</dt><dd>{item.context.requestedBy}</dd></div>}
                    {item.context.relatedTo && <div><dt>متعلّق بـ</dt><dd>{item.context.relatedTo}</dd></div>}
                    {item.context.origin && <div><dt>الخلفية</dt><dd>{item.context.origin}</dd></div>}
                  </dl>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
