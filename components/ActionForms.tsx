"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Send, SquarePen } from "lucide-react";
import type { Department, Employee } from "@/lib/types";

type Props = { employees: Employee[]; departments: Department[] };
type Notice = { type: "ok" | "error"; text: string } | null;

export default function ActionForms({ employees }: Props) {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitJson(url: string, payload: Record<string, unknown>, success: string) {
    setLoading(true);
    setNotice(null);
    setResult("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "تعذر تنفيذ الطلب.");
      setNotice({ type: "ok", text: success });
      if (data.inbox?.resultContent) setResult(data.inbox.resultContent);
      router.refresh();
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "حدث خطأ غير معروف." });
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
      "تم تنفيذ الطلب وإضافة النتيجة إلى الوارد."
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
        summary: "تقرير يومي منظم",
        achievements: form.get("achievements"),
        blockers: form.get("blockers"),
        nextStep: form.get("nextStep"),
        progressScore: Number(form.get("progressScore") || 7),
      },
      "تم إرسال التقرير إلى مسار المراجعة."
    );
    event.currentTarget.reset();
  }

  return (
    <section id="actions" className="action-grid">
      <article className="data-panel">
        <div className="section-heading">
          <div>
            <h3><Send size={18} /> طلب موحد للإدارة</h3>
            <p>اكتب الطلب مرة واحدة، ثم يوجهه النظام إلى الوكيل أو القسم المناسب.</p>
          </div>
        </div>
        <form className="form" onSubmit={onUnifiedRequest}>
          <textarea className="textarea" name="command" required placeholder="مثال: جهز خطة إطلاق خدمة جديدة وحدد الفريق والميزانية والمخاطر." />
          <select className="input" name="priority" defaultValue="HIGH">
            <option value="MEDIUM">أولوية عادية</option>
            <option value="HIGH">أولوية عالية</option>
            <option value="URGENT">عاجل</option>
          </select>
          <button className="primary-btn" disabled={loading}><Send size={17} /> إرسال الطلب</button>
        </form>
        {notice && <p className={`notice ${notice.type === "ok" ? "ok" : "error"}`}>{notice.text}</p>}
        {result && <pre className="inline-result">{result}</pre>}
      </article>

      <article className="data-panel">
        <div className="section-heading">
          <div>
            <h3><SquarePen size={18} /> تقرير يومي</h3>
            <p>يساعد الإدارة على رؤية الإنجاز والعوائق والخطوة التالية.</p>
          </div>
        </div>
        <form className="form" onSubmit={onLog}>
          <div className="form-row">
            <select className="input" name="employeeId">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}</select>
            <input className="input" name="progressScore" type="number" min="1" max="10" defaultValue="7" aria-label="درجة الإنجاز" />
          </div>
          <textarea className="textarea" name="achievements" required placeholder="الإنجازات الفعلية اليوم" />
          <textarea className="textarea" name="blockers" placeholder="العوائق أو المخاطر" />
          <textarea className="textarea" name="nextStep" required placeholder="الخطوة التالية المطلوبة" />
          <button className="secondary-btn" disabled={loading}><SquarePen size={17} /> إرسال التقرير</button>
        </form>
      </article>
    </section>
  );
}
