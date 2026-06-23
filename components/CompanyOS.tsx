import type { ReactNode } from "react";
import type { ActivityLog, Approval, DailyLog, Department, Employee, Notification, Task } from "@/lib/types";
import { Activity, Bell, ClipboardList, FileCheck2, ListChecks, Users } from "lucide-react";
import ActionForms from "./ActionForms";

type Props = { employees: Employee[]; departments: Department[]; tasks: Task[]; dailyLogs: DailyLog[]; approvals: Approval[]; notifications: Notification[]; activityLogs: ActivityLog[] };

const statusClass = (v: string) => v === "DONE" || v === "APPROVED" || v === "ACTIVE" ? "green" : v === "PENDING" || v === "TODO" || v === "SUBMITTED" ? "amber" : "blue";

function Kpi({ title, value, icon }: { title: string; value: number; icon: ReactNode }) {
  return <div className="card kpi"><div><div className="label">{title}</div><div className="value">{value}</div></div><span className="badge blue">{icon}</span></div>;
}

export default function CompanyOS(props: Props) {
  const employeeName = (id: string) => props.employees.find((e) => e.id === id)?.fullName ?? "غير معروف";
  const departmentName = (id: string) => props.departments.find((d) => d.id === id)?.name ?? "غير محدد";
  const openTasks = props.tasks.filter((t) => t.status !== "DONE").length;
  const pendingApprovals = props.approvals.filter((a) => a.status === "PENDING").length;
  const inboxCount = props.notifications.length + props.activityLogs.length;

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logo">GS</div><div><h1>Golden Star OS</h1><p>نظام إدارة الشركة الداخلي</p></div></div>
      <nav className="nav">
        <a className="active" href="#dashboard">لوحة القيادة</a>
        <a href="#actions">الطلب الموحد</a>
        <a href="#org">الهيكل الإداري</a>
        <a href="#finance">الإدارة المالية</a>
        <a href="#employees">الموظفون</a>
        <a href="#tasks">المهام</a>
        <a href="#logs">التقارير</a>
        <a href="#approvals">الموافقات</a>
        <a href="#notifications">الوارد والتنبيهات</a>
      </nav>
    </aside>
    <main className="main">
      <div id="dashboard" className="topbar"><div><h2>نظام إدارة تشغيلي للشركة</h2><p>تسلسل واضح: طلب الإدارة ← وكيل مختص ← نتيجة في سجل الوارد ← موافقة/تنفيذ.</p></div><span className="badge blue">Live AI Workflow</span></div>
      <section className="grid kpis"><Kpi title="الموظفون/الوكلاء" value={props.employees.length} icon={<Users size={18} />} /><Kpi title="المهام المفتوحة" value={openTasks} icon={<ClipboardList size={18} />} /><Kpi title="موافقات معلقة" value={pendingApprovals} icon={<FileCheck2 size={18} />} /><Kpi title="حركة الوارد" value={inboxCount} icon={<Activity size={18} />} /></section>
      <ActionForms employees={props.employees} departments={props.departments} />

      <section id="org" className="card" style={{ marginTop: 16 }}><h3>الهيكل الإداري والتسلسل الهرمي</h3><div className="grid three"><div className="feed-item"><strong>1. المدير التنفيذي</strong><span>خالد العمري — يعتمد الطلبات الكبرى ويستلم نتائج الوكلاء.</span></div><div className="feed-item"><strong>2. مدراء الأقسام / وكلاء AI</strong><span>المبيعات، التشغيل، المالية، الإدارة، الجودة، المشتريات.</span></div><div className="feed-item"><strong>3. التنفيذ والتقارير</strong><span>كل طلب يتحول إلى مهمة، ثم نتيجة وارد، ثم متابعة وموافقة.</span></div></div></section>

      <section id="finance" className="card" style={{ marginTop: 16 }}><h3>الإدارة المالية والرقابة</h3><div className="grid three"><div className="feed-item"><strong>الاعتماد المالي</strong><span>أي طلب مصروف أو شراء يجب أن يتحول إلى موافقة مالية قبل التنفيذ.</span></div><div className="feed-item"><strong>التدفق النقدي</strong><span>متابعة الإيرادات، المصروفات، التحصيل، والمدفوعات.</span></div><div className="feed-item"><strong>التقارير</strong><span>تقرير أسبوعي: مبيعات، تكلفة، هامش ربح، التزامات، ومخاطر.</span></div></div></section>

      <section id="employees" className="card" style={{ marginTop: 16 }}><h3><Users size={16} /> الموظفون والوكلاء</h3><table className="table"><thead><tr><th>الاسم</th><th>الدور</th><th>القسم</th><th>المسمى</th></tr></thead><tbody>{props.employees.map((e) => <tr key={e.id}><td>{e.fullName}</td><td>{e.role}</td><td>{departmentName(e.departmentId)}</td><td>{e.jobTitle}</td></tr>)}</tbody></table></section>

      <section id="tasks" className="card" style={{ marginTop: 16 }}><h3><ClipboardList size={16} /> المهام</h3><div className="feed">{props.tasks.map((t) => <div className="feed-item" key={t.id}><strong>{t.title}</strong><span>{employeeName(t.assignedTo)} · {departmentName(t.departmentId)} · {t.priority}</span><br/><span className={`badge ${statusClass(t.status)}`}>{t.status}</span></div>)}</div></section>

      <section id="logs" className="card" style={{ marginTop: 16 }}><h3><ListChecks size={16} /> التقارير اليومية ونتائج التنفيذ</h3><div className="feed">{props.dailyLogs.map((l) => <div className="feed-item" key={l.id}><strong>{employeeName(l.employeeId)} · {l.progressScore}/10</strong><span>{l.summary}</span><br/><span className={`badge ${statusClass(l.status)}`}>{l.status}</span></div>)}</div></section>

      <section id="approvals" className="card" style={{ marginTop: 16 }}><h3><FileCheck2 size={16} /> الموافقات</h3><div className="feed">{props.approvals.map((a) => <div className="feed-item" key={a.id}><strong>{a.entityType}</strong><span>{employeeName(a.requestedBy)} → {employeeName(a.approverId)}</span><br/><span className={`badge ${statusClass(a.status)}`}>{a.status}</span></div>)}</div></section>

      <section id="notifications" className="card" style={{ marginTop: 16 }}><h3><Bell size={16} /> الوارد والتنبيهات</h3><div className="feed">{props.notifications.map((n) => <div className="feed-item" key={n.id}><strong>{n.title}</strong><span>{n.message}</span><br/><span className="badge blue">{n.type}</span></div>)}</div></section>
    </main>
  </div>;
}
