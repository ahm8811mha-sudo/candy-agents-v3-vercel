"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Department, Employee } from "@/lib/types";

type Props = { employees: Employee[]; departments: Department[] };
type Notice = { type: "ok" | "error"; text: string } | null;

export default function ActionForms({ employees }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [loading, setLoading] = useState(false);

  async function submitJson(url: string, payload: Record<string, unknown>, success: string) {
    setLoading(true);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Action failed");
      setNotice({ type: "ok", text: success });
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "حدث خطأ غير معروف" });
    } finally {
      setLoading(false);
    }
  }

  async function onUnifiedRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitJson(
      "/api/commands",
      { command: form.get("command"), priority: form.get("priority") || "HIGH" },
      "تم إنشاء مهمة وتقرير متابعة أولي وإرسالهما للمراجعة."
    );
    event.currentTarget.reset();
  }

  async function onLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitJson(
      "/api/logs",
      {
        employeeId: form.get("employeeId"),
        summary: form.get("summary"),
        blockers: form.get("blockers"),
        progressScore: Number(form.get("progressScore") || 7),
      },
      "تم إرسال التقرير اليومي وإرساله إلى المدير للمراجعة."
    );
    event.currentTarget.reset();
  }

  return (
    <section id="actions" className="grid two" style={{ marginTop: 16 }}>
      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h3>طلب موحد للإدارة</h3>
        <p style={{ color: "var(--muted)", marginTop: -4 }}>اكتب الطلب مرة واحدة. النظام يحوله إلى مهمة وتقرير متابعة أولي.</p>
        <form className="form" onSubmit={onUnifiedRequest}>
          <textarea className="textarea" name="command" required placeholder="مثال: راجعوا مخزون المواد الخام وجهزوا تقرير الجودة" />
          <select className="input" name="priority" defaultValue="HIGH">
            <option value="MEDIUM">أولوية عادية</option>
            <option value="HIGH">أولوية عالية</option>
            <option value="URGENT">عاجل</option>
          </select>
          <button className="primary-btn" disabled={loading}>{loading ? "جاري تحويل الطلب..." : "إرسال الطلب"}</button>
        </form>
        {notice && <p className={`badge ${notice.type === "ok" ? "green" : "red"}`} style={{ marginTop: 10 }}>{notice.text}</p>}
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h3>تقرير موظف يومي</h3>
        <form className="form two" onSubmit={onLog}>
          <select className="input" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}</select>
          <input className="input" name="progressScore" type="number" min="1" max="10" defaultValue="7" />
          <textarea className="textarea" name="summary" required placeholder="ماذا أنجزت اليوم؟" />
          <textarea className="textarea" name="blockers" placeholder="العوائق أو المطلوب من الإدارة" />
          <button className="primary-btn" disabled={loading}>{loading ? "جاري إرسال التقرير..." : "إرسال التقرير"}</button>
        </form>
      </div>
    </section>
  );
}
