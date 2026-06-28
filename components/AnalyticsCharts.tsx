"use client";

type BarData = {
  label: string;
  value: number;
  color?: string;
};

type HealthGaugeProps = {
  score: number;
  label: string;
};

export function HealthGauge({ score, label }: HealthGaugeProps) {
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--amber)" : "var(--red)";
  const rotation = (score / 100) * 180;

  return (
    <div className="gauge-wrap">
      <div className="gauge-container">
        <div className="gauge-bg" />
        <div
          className="gauge-fill"
          style={{
            borderColor: color,
            borderBottomColor: "transparent",
            borderLeftColor: "transparent",
            transform: `rotate(${225 + rotation}deg)`,
          }}
        />
        <div className="gauge-value" style={{ color }}>{score}%</div>
      </div>
      <small className="gauge-label">{label}</small>
    </div>
  );
}

export function HorizontalBar({ data, title }: { data: BarData[]; title: string }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="chart-card">
      <strong>{title}</strong>
      {data.map((item) => (
        <div key={item.label} className="bar-item">
          <div className="bar-item-header">
            <span className="bar-item-label">{item.label}</span>
            <span className="bar-item-value">{item.value.toLocaleString("ar-SA")}</span>
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                background: item.color || "linear-gradient(90deg, var(--primary), var(--green))",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiniMetric({
  title,
  value,
  unit,
  trend,
}: {
  title: string;
  value: number;
  unit?: string;
  trend?: "up" | "down" | "stable";
}) {
  const trendColor =
    trend === "up" ? "var(--green)" : trend === "down" ? "var(--red)" : "var(--muted)";
  const trendSymbol = trend === "up" ? "▲" : trend === "down" ? "▼" : "●";

  return (
    <div className="mini-metric">
      <small className="mini-metric-label">{title}</small>
      <div className="mini-metric-row">
        <strong className="mini-metric-value">{value.toLocaleString("ar-SA")}</strong>
        {unit && <small className="mini-metric-unit">{unit}</small>}
      </div>
      {trend && (
        <span className="mini-metric-trend" style={{ color: trendColor }}>
          {trendSymbol}
        </span>
      )}
    </div>
  );
}

export function ProgressRing({
  progress,
  size = 80,
  label,
}: {
  progress: number;
  size?: number;
  label: string;
}) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const color = progress >= 70 ? "var(--green)" : progress >= 40 ? "var(--amber)" : "var(--red)";

  return (
    <div className="ring-wrap">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--panel-2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <strong style={{ color }}>{progress}%</strong>
      <small className="ring-label">{label}</small>
    </div>
  );
}

export function StatusDistribution({
  data,
  title,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  title: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  return (
    <div className="chart-card">
      <strong>{title}</strong>
      <div className="distribution-bar">
        {data.map((item) => (
          <div
            key={item.label}
            style={{
              width: `${(item.value / total) * 100}%`,
              background: item.color,
            }}
          />
        ))}
      </div>
      <div className="distribution-legend">
        {data.map((item) => (
          <div key={item.label} className="distribution-legend-item">
            <span className="distribution-dot" style={{ background: item.color }} />
            <small>{item.label}: {item.value}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
