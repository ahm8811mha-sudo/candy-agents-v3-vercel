"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

type Step = {
  id: string;
  label: string;
  description: string;
  durationMs: number;
};

const DEFAULT_STEPS: Step[] = [
  { id: "financials", label: "قراءة البيانات المالية", description: "تحليل الإيرادات والمصروفات والربح", durationMs: 2000 },
  { id: "cfo", label: "المدير المالي يراجع", description: "اعتماد الميزانية وتحليل المخاطر", durationMs: 4000 },
  { id: "ceo", label: "الرئيس التنفيذي يقرر", description: "إصدار القرار النهائي", durationMs: 3000 },
  { id: "tasks", label: "إنشاء خطة التنفيذ", description: "تحويل القرار إلى مهام وأدوار", durationMs: 3000 },
  { id: "save", label: "حفظ المشروع", description: "إنشاء مشروع ومهام في النظام", durationMs: 1500 },
];

export default function LoadingSteps({
  active,
  steps = DEFAULT_STEPS,
}: {
  active: boolean;
  steps?: Step[];
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!active) {
      setCurrentStep(0);
      setCompletedSteps(new Set());
      return;
    }

    let stepIndex = 0;
    setCurrentStep(0);
    setCompletedSteps(new Set());

    function advanceStep() {
      if (stepIndex >= steps.length) return;

      setCompletedSteps((prev) => new Set([...prev, stepIndex]));
      stepIndex++;
      setCurrentStep(stepIndex);

      if (stepIndex < steps.length) {
        setTimeout(advanceStep, steps[stepIndex].durationMs);
      }
    }

    const timer = setTimeout(advanceStep, steps[0].durationMs);
    return () => clearTimeout(timer);
  }, [active, steps]);

  if (!active) return null;

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: 10,
        background: "var(--panel)",
        padding: 18,
        display: "grid",
        gap: 4,
      }}
    >
      {steps.map((step, index) => {
        const isCompleted = completedSteps.has(index);
        const isCurrent = index === currentStep && !isCompleted;

        return (
          <div
            key={step.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 0",
              opacity: index > currentStep ? 0.4 : 1,
              transition: "opacity 0.3s ease",
            }}
          >
            <div style={{ flexShrink: 0 }}>
              {isCompleted ? (
                <CheckCircle2 size={22} style={{ color: "var(--green)" }} />
              ) : isCurrent ? (
                <Loader2 className="spin" size={22} style={{ color: "var(--amber)" }} />
              ) : (
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    border: "2px solid var(--line)",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "0.7rem",
                    fontWeight: 900,
                    color: "var(--muted)",
                  }}
                >
                  {index + 1}
                </div>
              )}
            </div>
            <div>
              <strong
                style={{
                  fontSize: "0.9rem",
                  color: isCompleted
                    ? "var(--green)"
                    : isCurrent
                      ? "var(--amber)"
                      : "var(--text)",
                }}
              >
                {step.label}
              </strong>
              <br />
              <small style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                {step.description}
              </small>
            </div>
            {isCompleted && (
              <span
                style={{
                  marginRight: "auto",
                  color: "var(--green)",
                  fontSize: "0.75rem",
                  fontWeight: 900,
                }}
              >
                اكتمل
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
