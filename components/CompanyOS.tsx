import type { ActivityLog, Approval, DailyLog, Department, Employee, Notification, Task } from "@/lib/types";
import { Activity, Bell, ClipboardList, FileCheck2, LineChart, ListChecks, Users } from "lucide-react";

type Props = {
  employees: Employee[];
  departments: Department[];
  tasks: Task[];
  dailyLogs: DailyLog[];
  approvals: Approval[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
};

function statusBadge(status: string) {
  const cls = status === "DONE" || status === "APPROVED" || status === "ACTIVE" ? "green" : status === "PENDING" || status === "REVIEW" || status === "IN_PROGRESS" ? "amber" : status === "BLOCKED" || status === "REJECTED" ? "red" : "blue";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export default function CompanyOS(props: Props) {
  const openTasks = props.tasks.filter((task) => task.status !== "DONE").length;
  const overdue = props.tasks.filter((task) => task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE").length;
  const pendingApprovals = props.approvals.filter((approval) => approval.status === "PENDING").length;
  const avgProgress = props.dailyLogs.length === 0 ? 0 : Math.round(props.dailyLogs.reduce((sum, log) => sum + log.progressScore, 0) / props.dailyLogs.length);
  const employeeName = (id: string) => props.employees.find((employee) => employee.id === id)?.fullName ?? "غير معروف";
  const departmentName = (id: string) => props.departments.find((department) => department.id === id)?.name ?? "غير محدد";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="logo">GS</div><div><h1>Golden Star OS</h1><p>نظام إدارة الشركة الداخلي</p></div></div>
        <div className="nav">
          <button className="active">لوحة القيادة</button>
          <button>الموظفون</button>
          <button>المهام</button>
          <button>السجلات اليومية</button>
          <button>الموافقات</button>
          <button>التقارير</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar"><div><h2>نظام إدارة تشغيلي للشركة</h2><p>مهام، موظفون، موافقات، نشاط مباشر، وتقارير تنفيذية في مكان واحد.</p></div><span className="badge blue">Next.js + Supabase Ready</span></div>

        <section className="grid kpis">
          <Kpi title="الموظفون" value={props.employees.length} icon={<Users size={18} />} />
          <Kpi title="المهام المفتوحة" value={openTasks} icon={<ClipboardList size={18} />} />
          <Kpi title="المهام المتأخرة" value={overdue} icon={<Activity size={18} />} danger />
          <Kpi title="موافقات معلقة" value={pendingApprovals} icon={<FileCheck2 size={18} />} />
        </section>

        <section className="grid two" style={{ marginTop: 16 }}>
          <div className="card"><h3><LineChart size={16} /> الملخص التنفيذي</h3><div className="grid three"><div className="feed-item"><strong>متوسط التقدم</strong><span>{avgProgress}/10 حسب السجلات اليومية</span></div><div className="feed-item"><strong>حالة قاعدة البيانات</strong><span>يعمل مع Supabase عند ضبط المتغيرات، أو Demo fallback عند عدم وجودها.</span></div><div className="feed-item"><strong>Google Sheets</strong><span>مهيأ كتصدير آمن عبر API وليس كقاعدة بيانات رئيسية.</span></div></div></div>
          <div className="card"><h3>النشاط المباشر</h3><div className="feed">{props.activityLogs.map((item) => <div className="feed-item" key={item.id}><strong>{item.action}</strong><span>{employeeName(item.actorId)} · {new Date(item.createdAt).toLocaleString("ar-SA")}</span></div>)}</div></div>
        </section>

        <section className="card" style={{ marginTop: 16 }}><h3><Users size={16} /> إدارة الموظفين</h3><table className="table"><thead><tr><th>الموظف</th><th>الدور</th><th>القسم</th><th>المسمى</th><th>الحالة</th></tr></thead><tbody>{props.employees.map((employee) => <tr key={employee.id}><td><strong>{employee.fullName}</strong><br/><span style={{color:"var(--muted)"}}>{employee.email}</span></td><td>{employee.role}</td><td>{departmentName(employee.departmentId)}</td><td>{employee.jobTitle}</td><td>{statusBadge(employee.status)}</td></tr>)}</tbody></table></section>

        <section className="card" style={{ marginTop: 16 }}><h3><ClipboardList size={16} /> إدارة المهام</h3><div className="board">{["TODO", "IN_PROGRESS", "REVIEW", "DONE"].map((status) => <div className="column" key={status}><h3>{status}</h3>{props.tasks.filter((task) => task.status === status).map((task) => <article className="task" key={task.id}><h4>{task.title}</h4><p>{task.description}</p><span className="badge blue">{employeeName(task.assignedTo)}</span> <span className="badge amber">{task.priority}</span></article>)}</div>)}</div></section>

        <section className="grid two" style={{ marginTop: 16 }}>
          <div className="card"><h3><ListChecks size={16} /> السجلات اليومية</h3><div className="feed">{props.dailyLogs.map((log) => <div className="feed-item" key={log.id}><strong>{employeeName(log.employeeId)} · {log.progressScore}/10</strong><span>{log.summary}</span><br />{statusBadge(log.status)}</div>)}</div></div>
          <div className="card"><h3><FileCheck2 size={16} /> الموافقات</h3><div className="feed">{props.approvals.map((approval) => <div className="feed-item" key={approval.id}><strong>{approval.entityType}</strong><span>{employeeName(approval.requestedBy)} → {employeeName(approval.approverId)}</span><br />{statusBadge(approval.status)}</div>)}</div></div>
        </section>

        <section className="card" style={{ marginTop: 16 }}><h3><Bell size={16} /> التنبيهات</h3><div className="feed">{props.notifications.map((notification) => <div className="feed-item" key={notification.id}><strong>{notification.title}</strong><span>{notification.message}</span><br/><span className="badge blue">{notification.type}</span></div>)}</div></section>
      </main>
    </div>
  );
}

function Kpi({ title, value, icon, danger }: { title: string; value: number; icon: React.ReactNode; danger?: boolean }) {
  return <div className="card kpi"><div><div className="label">{title}</div><div className="value" style={{ color: danger ? "var(--red)" : "var(--text)" }}>{value}</div></div><span className={`badge ${danger ? "red" : "blue"}`}>{icon}</span></div>;
}
