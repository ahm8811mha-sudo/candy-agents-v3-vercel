"use client";

import { useState } from "react";

export default function TaskCheckpointPanel() {
  const [step, setStep] = useState(0);
  const items = ["بيانات جاهزة", "مراجعة أولى", "تعبئة الحقول", "مراجعة نهائية", "حفظ المرجع"];
  return (
    <section className="ops-card executive-brief">
      <span className="eyebrow">Task Flow</span>
      <h2>مسار المهمة</h2>
      <p className="muted">يتابع هذا المسار العمل على مراحل واضحة حتى الإغلاق.</p>
      <div className="statement-list">
        {items.map((item, index) => (
          <button key={item} type="button" className="statement-row action" onClick={() => setStep(index + 1)}>
            <span><b>{index + 1}. {item}</b><small>{step > index ? "Done" : "Pending"}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}
