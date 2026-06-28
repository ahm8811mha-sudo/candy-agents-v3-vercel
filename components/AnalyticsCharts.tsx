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
    <div style={{ textAlign: "center", padding: 16 }}>
      <div
        style={{
          position: "relative",
          width: 140,
          height: 70,
          margin: "0 auto",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 140,
            height: 140,
            borderRadius: "50%",
            border: "10px solid var(--panel-2)",
            borderBottomColor: "transparent",
            borderLeftColor: "transparent",
            transform: "rotate(225deg)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 140,
            height: 140,
            borderRadius: "50%",
            border: `10px solid ${color}`,
            borderBottomColor: "transparent",
            borderLeftColor: "transparent",
            transform: `rotate(${225 + rotation}deg)`,
            transition: "transform 1s ease-out",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: "1.8rem",
            fontWeight: 900,
            color,
          }}
        >
          {score}%
        </div>
      </div>
      <small style={{ color: "var(--muted)", fontWeight: 800, marginTop: 8, display: "block" }}>
        {label}
      </small>
    </div>
  );
}

export function HorizontalBar({ data, title }: { data: BarData[]; title: string }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--panel)",
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <strong style={{ fontSize: "1rem" }}>{title}</strong>
      {data.map((item) => (
        <div key={item.label} style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
            <span style={{ color: "var(--muted)" }}>{item.label}</span>
            <span style={{ fontWeight: 900 }}>{item.value.toLocaleString("ar-SA")}</span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "var(--panel-2)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(item.value / maxValue) * 100}%`,
                borderRadius: "inherit",
                background: item.color || "linear-gradient(90deg, var(--primary), var(--green))",
                transition: "width 0.8s ease-out",
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
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "#0f1520",
        padding: 14,
        display: "grid",
        gap: 6,
      }}
    >
      <small style={{ color: "var(--muted)", fontWeight: 800 }}>{title}</small>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <strong style={{ fontSize: "1.5rem" }}>{value.toLocaleString("ar-SA")}</strong>
        {unit && <small style={{ color: "var(--muted)" }}>{unit}</small>}
      </div>
      {trend && (
        <span style={{ color: trendColor, fontSize: "0.78rem", fontWeight: 900 }}>
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
    <div style={{ textAlign: "center", display: "grid", gap: 6, justifyItems: "center" }}>
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
      <strong style={{ fontSize: "0.9rem", color }}>{progress}%</strong>
      <small style={{ color: "var(--muted)", fontSize: "0.78rem" }}>{label}</small>
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
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--panel)",
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <strong>{title}</strong>
      <div
        style={{
          height: 12,
          borderRadius: 999,
          overflow: "hidden",
          display: "flex",
          background: "var(--panel-2)",
        }}
      >
        {data.map((item) => (
          <div
            key={item.label}
            style={{
              width: `${(item.value / total) * 100}%`,
              height: "100%",
              background: item.color,
              transition: "width 0.8s ease-out",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {data.map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: item.color,
              }}
            />
            <small style={{ color: "var(--muted)" }}>
              {item.label}: {item.value}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
