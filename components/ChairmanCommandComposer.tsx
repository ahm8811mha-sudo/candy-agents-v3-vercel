"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { COMPANY_AGENTS } from "@/lib/company/agents";

const PRIORITIES = [
  { value: "LOW", label: "منخفضة" },
  { value: "MEDIUM", label: "متوسطة" },
  { value: "HIGH", label: "عالية" },
  { value: "URGENT", label: "عاجلة" },
] as const;

export type IssuedCommand = {
  id: string;
  subject: string;
  status: string;
  ownerAgentId: string;
  ownerName: string;
  currentStep: string;
  blockers: string[];
  resultReport: string | null;
};

const employees = COMPANY_AGENTS.filter((agent) => agent.id !== "owner");

export default function ChairmanCommandComposer({ onIssued }: { onIssued?: (command: IssuedCommand) => void }) {
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("automatic");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]["value"]>("HIGH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<IssuedCommand | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = text.trim();
    if (command.length < 3) {
      setError("الأمر قصير.");
      setIssued(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, assignee, priority }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.command?.id) throw new Error(json.message || "تعذر تسجيل الأمر.");
      const next = json.command as IssuedCommand;
      setIssued(next);
      setText("");
      setAssignee("automatic");
      setPriority("HIGH");
      onIssued?.(next);
    } catch (cause) {
      setIssued(null);
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل الأمر.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="chairman-order" aria-label="أمر رئيس مجلس الإدارة" onSubmit={submit}>
      <div>
        <h2>أمر رئيس مجلس الإدارة</h2>
        <p>اكتب الأمر باسم الموظف، أو اترك التوجيه تلقائياً. الصرف والإرسال الخارجي يبقيان بانتظار اعتمادك.</p>
      </div>
      <label className="field-label">
        الأمر
        <textarea
          className="input"
          name="command"
          rows={4}
          value={text}
          placeholder="مثال: خالد: جهّز مقارنة 3 موردين للتغليف"
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="order-fields">
        <label className="field-label">
          الموظف المسؤول
          <select className="input" name="assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
            <option value="automatic">تلقائي</option>
            {employees.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
        </label>
        <label className="field-label">
          الأولوية
          <select className="input" name="priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}>
            {PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <button className="primary-btn" type="submit" disabled={busy}>{busy ? "جارٍ التسجيل" : "إصدار الأمر"}</button>
      {error ? <p className="order-feedback" role="alert">{error}</p> : null}
      {issued ? (
        <p className="order-feedback" role="status">
          وصل الأمر إلى {issued.ownerName}.{" "}
          <Link href={`/commands#${issued.id}`}>بطاقة المتابعة</Link>
        </p>
      ) : null}
    </form>
  );
}
