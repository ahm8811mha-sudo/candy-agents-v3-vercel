"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { Department, Employee } from "@/lib/types";

type Props = { employees: Employee[]; departments: Department[] };

type Notice = { type: "ok" | "error"; text: string } | null;

export default function ActionForms({ employees, departments }: Props) {
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

  async function onCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitJson("/api/commands", { command: form.get("command") }, "تم تحويل أمر المدير التنفيذي إلى مهمة موجهة.");
    event.currentTarget.reset();
  }

  async function onTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitJson("/api/tasks", {
      title: form.get("title"),
      description: form.get("description"),
      assignedTo: form.get("assignedTo"),
      departmentId: form.get("departmentId"),
      priority: form.get("priority"),
      createdBy: "e-ceo",
    }, "تم حفظ المهمة بنجاح.");
    event.currentTarget.reset();
  }

  async function onLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await submitJson("/api/logs", {
      employeeId: form.get("employeeId"),
      summary: form.get("summary"),
      blockers: form.get("blockers"),
      progressScore: Number(form.get("progressScore") || 7),
    }, "تم إرسال التقرير اليومي بنجاح.");
    event.currentTarget.reset();
  }

  return (
    <section className="grid two" style={{ marginTop: 16 }}>
      <div className="card">
        <h3>أمر المدير التنفيذي</h3>
        <form className="form" onSubmit={onCommand}>
          <textarea className="textarea" name="command" required placeholder="مثال: راجعوا مخزون المواد الخام وأنشئوا تقريرًا للمدير" />
          <button className="primary-btn" disabled={loading}>{loading ? "جاري التنفيذ..." : "إصدار الأمر"}</button>
        </form>
        {notice && <p className={`badge ${notice.type === "ok" ? "green" : "red"}`} style={{ marginTop: 10 }}>{notice.text}</p>}
      </div>

      <div className="card">
        <h3>إنشاء مهمة</h3>
        <form className="form two" onSubmit={onTask}>
          <input className="input" name="title" required placeholder="عنوان المهمة" />
          <select className="input" name="assignedTo">{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}</select>
          <select className="input" name="departmentId">{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <select className="input" name="priority" defaultValue="MEDIUM"><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="URGENT">URGENT</option></select>
          <textarea className="textarea" name="description" placeholder="وصف المهمة" />
          <button className="primary-btn" disabled={loading}>{loading ? "جاري الحفظ..." : "حفظ المهمة"}</button>
        </form>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h3>تقرير موظف يومي</h3>
        <form className="form two" onSubmit={onLog}>
          <select className="input" name="employeeId">{employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}</select>
          <input className="input" name="progressScore" type="number" min="1" max="10" defaultValue="7" />
          <textarea className="textarea" name="summary" required placeholder="ماذا أنجزت اليوم؟" />
          <textarea className="textarea" name="blockers" placeholder="العوائق أو المطلوب من الإدارة" />
          <button className="primary-btn" disabled={loading}>{loading ? "جاري الإرسال..." : "إرسال التقرير"}</button>
        </form>
      </div>
    </section>
  );
}
