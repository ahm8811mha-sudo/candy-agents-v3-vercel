"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, Inbox, Loader2, PenLine, RefreshCcw, Send, ShieldCheck, UserCheck } from "lucide-react";
import styles from "./MailCenterApiPanel.module.css";

type Box = "INBOX" | "SENT" | "DRAFTS" | "ARCHIVED";

type Message = {
  id: string;
  reference: string;
  mailbox: Box | string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  status: string;
  contactType: "GOVERNMENT" | "COMPANY" | "INDIVIDUAL";
  createdAt: string;
};

type Task = {
  id: string;
  messageId: string;
  agentId: string;
  agentName: string;
  agentTitle: string;
  instruction: string;
  executionResult: string;
  status: string;
  createdAt: string;
};

type Ready = { database: boolean; realEmail: boolean; provider: string; fromEmail?: string | null; gmailReady?: boolean; missingGmailKeys?: string[] };

const boxes: Array<{ key: Box; label: string; description: string }> = [
  { key: "INBOX", label: "الوارد", description: "كل المخاطبات والرسائل القادمة إلى الشركة" },
  { key: "SENT", label: "الصادر", description: "كل الرسائل التي أرسلتها الشركة" },
  { key: "DRAFTS", label: "المسودات", description: "رسائل محفوظة ولم ترسل بعد" },
  { key: "ARCHIVED", label: "الأرشيف", description: "مخاطبات مغلقة ومحفوظة للرجوع إليها" },
];

const employees = [
  { id: "sultan", label: "سلطان — الرئيس التنفيذي" },
  { id: "abdulrahman", label: "عبدالرحمن — المدير المالي" },
  { id: "noura", label: "نورة — التسويق" },
  { id: "fahad", label: "فهد — العمليات" },
  { id: "sara", label: "سارة — المبيعات" },
  { id: "khalid", label: "خالد — المشتريات" },
  { id: "majed", label: "ماجد — العلاقات الحكومية" },
  { id: "ameen", label: "أمين — المحاسب" },
  { id: "hares", label: "حارس — المخاطر والحوكمة" },
];

function normalizeBox(value: string): Box {
  const v = value.toUpperCase();
  if (v === "SENT") return "SENT";
  if (v === "DRAFTS" || v === "DRAFT") return "DRAFTS";
  if (v === "ARCHIVED" || v === "ARCHIVE") return "ARCHIVED";
  return "INBOX";
}

export default function MailCenterApiPanel() {
  const [box, setBox] = useState<Box>("INBOX");
  const [messages, setMessages] = useState<Message[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [ready, setReady] = useState<Ready | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("طلب رسمي");
  const [bodyText, setBodyText] = useState("تحية طيبة،\n\nنأمل منكم التكرم بالإفادة بخصوص الطلب.\n\nمع الشكر،\nOrvanta");
  const [contactType, setContactType] = useState<"GOVERNMENT" | "COMPANY" | "INDIVIDUAL">("COMPANY");
  const [agentId, setAgentId] = useState("sultan");
  const [instruction, setInstruction] = useState("راجع هذه الرسالة، حدّد المطلوب، وجهز الإجراء المناسب أو مسودة الرد.");
  const mailboxRef = useRef<HTMLElement | null>(null);

  const normalizedMessages = useMemo(() => messages.map((m) => ({ ...m, mailbox: normalizeBox(String(m.mailbox)) })), [messages]);

  function currentList(target: Box) {
    return normalizedMessages.filter((m) => m.mailbox === target);
  }

  function messageTasks(messageId: string) {
    return tasks.filter((task) => task.messageId === messageId);
  }

  function openBox(nextBox: Box) {
    setBox(nextBox);
    const first = currentList(nextBox)[0];
    setSelectedId(first?.id || "");
    const url = new URL(window.location.href);
    url.searchParams.set("mailbox", nextBox.toLowerCase());
    window.history.replaceState({}, "", url.toString());
    setTimeout(() => mailboxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function load() {
    setLoading(true);
    const res = await fetch("/api/correspondence", { cache: "no-store" });
    const json = await res.json();
    if (json.ok) {
      const loaded: Message[] = json.messages || [];
      setMessages(loaded);
      setTasks(json.tasks || []);
      setReady(json.readiness || null);
      const params = new URLSearchParams(window.location.search);
      const requested = normalizeBox(params.get("mailbox") || box);
      setBox(requested);
      const normalized = loaded.map((m) => ({ ...m, mailbox: normalizeBox(String(m.mailbox)) }));
      const first = normalized.find((m) => m.mailbox === requested);
      if (!selectedId || !normalized.some((m) => m.id === selectedId)) setSelectedId(first?.id || "");
    }
    setLoading(false);
  }

  useEffect(() => {
    load().catch(() => {
      setLoading(false);
      setNotice("تعذر تحميل البريد.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post(action: string, payload: Record<string, unknown>) {
    const res = await fetch("/api/correspondence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const json = await res.json();
    if (json.messages) setMessages(json.messages);
    if (json.tasks) setTasks(json.tasks);
    return json;
  }

  async function syncInbox() {
    const json = await post("sync", {});
    setNotice(json.ok ? `نتيجة مزامنة Gmail: ${json.synced || 0} رسالة. ${json.reason || ""}` : `تعذرت مزامنة Gmail. ${json.reason || ""}`);
    openBox("INBOX");
  }

  async function save() {
    const json = await post("save", { toEmail, subject, bodyText, contactType, needsApproval: false });
    setNotice(json.ok ? "تم حفظ المسودة." : "تعذر الحفظ.");
    await load();
    openBox("DRAFTS");
  }

  async function send() {
    const json = await post("send", { toEmail, subject, bodyText, contactType, needsApproval: false });
    setNotice(json.sent ? "تم الإرسال مباشرة عبر Gmail." : `لم يتم الإرسال: ${json.reason || "سبب غير معروف"}`);
    await load();
    openBox(json.sent ? "SENT" : "DRAFTS");
  }

  async function archive(id: string) {
    const json = await post("archive", { id });
    setNotice(json.ok ? "تمت الأرشفة." : "تعذر الأرشفة.");
    await load();
    openBox("ARCHIVED");
  }

  async function assignTask() {
    if (!selected) return;
    setAssigning(true);
    const json = await post("assignTask", { messageId: selected.id, agentId, instruction });
    setNotice(json.ok ? "تم تحويل الرسالة للموظف وتنفيذ المطلوب مبدئياً." : `تعذر تحويل المهمة: ${json.error || "خطأ غير معروف"}`);
    setAssigning(false);
  }

  const list = currentList(box);
  const selected = normalizedMessages.find((m) => m.id === selectedId) || list[0];
  const selectedTasks = selected ? messageTasks(selected.id) : [];
  const missing = ready?.missingGmailKeys?.length ? ` · ناقص: ${ready.missingGmailKeys.join(", ")}` : "";
  const active = boxes.find((item) => item.key === box) || boxes[0];

  return (
    <div className={styles.stack}>
      <section className={styles.statsGrid}>
        {boxes.map((b) => (
          <button key={b.key} className={`bento-card ${styles.statButton} ${box === b.key ? "bento-card--green" : ""}`} onClick={() => openBox(b.key)}>
            <span className="bento-kicker"><Inbox size={15} /> {b.label}</span>
            <span className="bento-value">{currentList(b.key).length}</span>
            <span className="bento-label">اضغط لفتح {b.label}</span>
          </button>
        ))}
        <div className={`bento-card ${styles.statCard} ${ready?.realEmail ? "bento-card--green" : "bento-card--amber"}`}>
          <span className="bento-kicker"><ShieldCheck size={15} /> الجاهزية</span>
          <span className="bento-value">{ready?.realEmail ? "Live" : "Setup"}</span>
          <span className="bento-label">{ready?.database ? "DB جاهزة" : "شغّل SQL"} · {ready?.provider || "Provider"}{missing}</span>
        </div>
      </section>

      {notice && <section className={styles.notice}>{notice}</section>}

      <section ref={mailboxRef} className={styles.workbench}>
        <div className={styles.card}>
          <div className={styles.headerRow}>
            <div>
              <h2>صندوق {active.label}</h2>
              <p>{active.description}</p>
            </div>
            <div className={styles.actionRow}>
              <button className="secondary-btn btn-sm" onClick={load} disabled={loading}>{loading ? <Loader2 className="spin" size={14} /> : <RefreshCcw size={14} />} تحديث</button>
              {box === "INBOX" && <button className="primary-btn btn-sm" onClick={syncInbox}><RefreshCcw size={14} /> مزامنة Gmail</button>}
            </div>
          </div>

          <div className={styles.tabs}>
            {boxes.map((b) => <button key={b.key} className={`${styles.tab} ${box === b.key ? styles.tabActive : ""}`} onClick={() => openBox(b.key)}>{b.label}</button>)}
          </div>

          <div className={styles.messageList}>
            {list.map((m) => {
              const count = messageTasks(m.id).length;
              return (
                <button key={m.id} className={`${styles.messageRow} ${selected?.id === m.id ? styles.messageRowActive : ""}`} onClick={() => setSelectedId(m.id)}>
                  <span>
                    <span className={styles.messageTitle}>{m.subject}</span>
                    <br />
                    <span className={styles.emailMeta}>{m.fromEmail} → {m.toEmail}</span>
                  </span>
                  <span className="mini-pill">{count ? `${count} مهمة` : m.status}</span>
                </button>
              );
            })}
            {list.length === 0 && <div className="department-empty">لا توجد رسائل في صندوق {active.label}.</div>}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.headerRow}>
            <h2>قراءة وتحويل الرسالة</h2>
            {selected && <span className="mini-pill">{selected.status}</span>}
          </div>

          {selected ? (
            <>
              <div className={styles.referenceBox}>
                <small className={styles.muted}>المرجع</small>
                <b>{selected.reference}</b>
                <small className={styles.emailMeta}>{selected.fromEmail} → {selected.toEmail}</small>
              </div>
              <pre className={styles.outputPre}>{selected.bodyText}</pre>

              <div className={styles.delegateBox}>
                <h3><UserCheck size={17} /> تحويل الرسالة لموظف</h3>
                <div className={styles.formGrid}>
                  <label>الموظف / الوكيل<select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>{employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
                  <label>المطلوب من الموظف<textarea className="textarea compact" value={instruction} onChange={(e) => setInstruction(e.target.value)} /></label>
                </div>
                <div className={styles.actionRow}>
                  <button className="primary-btn" onClick={assignTask} disabled={assigning || !instruction.trim()}>{assigning ? <Loader2 className="spin" size={16} /> : <Send size={16} />} أرسل المهمة للموظف</button>
                  <button className="secondary-btn" onClick={() => archive(selected.id)}><Archive size={16} /> أرشفة</button>
                </div>
              </div>

              <div className={styles.taskList}>
                <h3>نتائج الموظفين على هذه الرسالة</h3>
                {selectedTasks.map((task) => (
                  <article key={task.id} className={styles.taskCard}>
                    <div className={styles.taskHead}>
                      <b>{task.agentName} · {task.agentTitle}</b>
                      <span className="mini-pill done">{task.status}</span>
                    </div>
                    <small className={styles.muted}>المطلوب: {task.instruction}</small>
                    <pre className={styles.outputPre}>{task.executionResult}</pre>
                  </article>
                ))}
                {selectedTasks.length === 0 && <p className={styles.muted}>لم يتم تحويل هذه الرسالة لأي موظف بعد.</p>}
              </div>
            </>
          ) : <div className="department-empty">اختر رسالة من صندوق {active.label}.</div>}
        </div>
      </section>

      <section className={styles.composeGrid}>
        <div className={styles.card}>
          <h2>إنشاء صادر</h2>
          <label>المستلم<input className="input" value={toEmail} onChange={(e) => setToEmail(e.target.value)} /></label>
          <label>الموضوع<input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          <label>النوع<select className="input" value={contactType} onChange={(e) => setContactType(e.target.value as typeof contactType)}><option value="GOVERNMENT">جهة رسمية</option><option value="COMPANY">شركة</option><option value="INDIVIDUAL">فرد</option></select></label>
          <label>النص<textarea className="textarea" value={bodyText} onChange={(e) => setBodyText(e.target.value)} /></label>
        </div>
        <div className={styles.card}>
          <h2>معاينة الصادر</h2>
          <pre className={styles.outputPre}>{bodyText}</pre>
          <div className={styles.actionRow}>
            <button className="primary-btn" onClick={send}><Send size={16} /> إرسال مباشر</button>
            <button className="secondary-btn" onClick={save}><PenLine size={16} /> حفظ مسودة</button>
          </div>
        </div>
      </section>
    </div>
  );
}
