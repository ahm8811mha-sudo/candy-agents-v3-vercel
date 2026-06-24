import type { ReactNode } from "react";
import type { ActivityLog, Approval, DailyLog, Department, Employee, Notification, Task } from "@/lib/types";
import { Activity, Bell, Building2, CheckCircle2, ClipboardList, FileCheck2, Gauge, Users } from "lucide-react";
import ActionForms from "./ActionForms";
import TaskActions from "./TaskActions";

type Props = {
  employees: Employee[];
  departments: Department[];
  tasks: Task[];
  dailyLogs: DailyLog[];
  approvals: Approval[];
  notifications: Notification[];
  activityLogs: ActivityLog[];
};

const statusClass = (value: string) => {
  if (["DONE", "APPROVED", "ACTIVE"].includes(value)) return "green";
  if (["PENDING", "TODO", "SUBMITTED", "REVIEW"].includes(value)) return "amber";
  if (["BLOCKED", "REJECTED"].includes(value)) return "red";
  return "blue";
};

function Kpi({ title, value, hint, icon }: { title: string; value: number | string; hint: string; icon: ReactNode }) {
  return (
    <article className="metric-card">
      <div className="metric-icon">{icon}</div>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export default function CompanyOS(props: Props) {
  const employeeName = (id: string) => props.employees.find((employee) => employee.id === id)?.fullName ?? "غير محدد";
  const departmentName = (id: string) => props.departments.find((department) => department.id === id)?.name ?? "غير محدد";
  const openTasks = props.tasks.filter((task) => task.status !== "DONE").length;
  const pendingApprovals = props.approvals.filter((approval) => approval.status === "PENDING").length;
  const overdue = props.tasks.filter((task) => task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "DONE").length;
  const avgProgress = props.dailyLogs.length
    ? Math.round(props.dailyLogs.reduce((total, log) => total + log.progressScore, 0) / props.dailyLogs.length * 10)
    : 0;

  return (
    <section className="company-shell" id="dashboard">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">AI</div>
          <div>
            <h1>Candy Agents</h1>
            <p>نظام تشغيل شركة مدعوم بوكلاء ذكاء اصطناعي</p>
          </div>
        </div>
        <nav className="nav" aria-label="لوحة التحكم">
          <a className="active" href="#agent-pipeline">نظام الوكلاء</a>
          <a href="#actions">الطلبات والتقارير</a>
          <a href="#tasks">المهام</a>
          <a href="#approvals">الموافقات</a>
          <a href="#activity">النشاط</a>
        </nav>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <span className="eyebrow"><Building2 size={16} /> Company Command Center</span>
            <h2>لوحة إدارة فعلية تربط القرار بالتنفيذ</h2>
            <p>المنتج لا يكتفي بإجابة نصية: يحلل السوق، يختار فرصة، يصدر قرارًا، ثم يحوّله إلى مهام وموافقات ومتابعة.</p>
          </div>
          <span className="status-pill done"><CheckCircle2 size={16} /> جاهز للتشغيل</span>
        </div>

        <section className="metrics-grid" aria-label="مؤشرات الشركة">
          <Kpi title="الوكلاء والموظفون" value={props.employees.length} hint="أدوار تنفيذ ومراجعة" icon={<Users size={20} />} />
          <Kpi title="المهام المفتوحة" value={openTasks} hint="مرتبطة بمسؤول وتاريخ" icon={<ClipboardList size={20} />} />
          <Kpi title="موافقات معلقة" value={pendingApprovals} hint="تمنع الموافقة الذاتية" icon={<FileCheck2 size={20} />} />
          <Kpi title="مؤشر الإنجاز" value={`${avgProgress}%`} hint={overdue ? `${overdue} مهمة متأخرة` : "لا توجد مهام متأخرة"} icon={<Gauge size={20} />} />
        </section>

        <ActionForms employees={props.employees} departments={props.departments} />

        <section className="ops-grid">
          <article id="tasks" className="data-panel wide">
            <div className="section-heading">
              <div>
                <h3>المهام التنفيذية</h3>
                <p>كل مهمة لها مالك، أولوية، حالة، ونسبة تقدم.</p>
              </div>
            </div>
            <div className="task-board">
              {props.tasks.map((task) => (
                <div className="task-card" key={task.id}>
                  <div className="task-header">
                    <strong>{task.title}</strong>
                    <span className={`badge ${statusClass(task.status)}`}>{task.status}</span>
                  </div>
                  <p>{task.description}</p>
                  <div className="task-meta">
                    <span>{employeeName(task.assignedTo)}</span>
                    <span>{departmentName(task.departmentId)}</span>
                    <span>{task.priority}</span>
                  </div>
                  <div className="progress-track"><span style={{ width: `${task.progressPercent ?? 0}%` }} /></div>
                  <div className="task-actions">
                    <small>الاستحقاق: {task.dueDate ? new Date(task.dueDate).toLocaleDateString("ar-SA") : "غير محدد"}</small>
                    <TaskActions id={task.id} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article id="approvals" className="data-panel">
            <h3><FileCheck2 size={18} /> الموافقات</h3>
            <div className="feed">
              {props.approvals.map((approval) => (
                <div className="feed-item" key={approval.id}>
                  <strong>{approval.entityType}</strong>
                  <span>{employeeName(approval.requestedBy)} إلى {employeeName(approval.approverId)}</span>
                  <span className={`badge ${statusClass(approval.status)}`}>{approval.status}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="data-panel">
            <h3><Bell size={18} /> الوارد</h3>
            <div className="feed">
              {props.notifications.map((notification) => (
                <div className="feed-item" key={notification.id}>
                  <strong>{notification.title}</strong>
                  <span>{notification.message}</span>
                  <span className="badge blue">{notification.type}</span>
                </div>
              ))}
            </div>
          </article>

          <article id="activity" className="data-panel wide">
            <h3><Activity size={18} /> سجل النشاط والتقارير اليومية</h3>
            <div className="activity-grid">
              {props.dailyLogs.map((log) => (
                <div className="feed-item" key={log.id}>
                  <strong>{employeeName(log.employeeId)} · {log.progressScore}/10</strong>
                  <span>{log.summary}</span>
                  <span className={`badge ${statusClass(log.status)}`}>{log.status}</span>
                </div>
              ))}
              {props.activityLogs.slice(0, 4).map((item) => (
                <div className="feed-item" key={item.id}>
                  <strong>{item.action}</strong>
                  <span>{item.entityType ?? "system"} · {item.entityId ?? "general"}</span>
                  <span>{new Date(item.createdAt).toLocaleDateString("ar-SA")}</span>
                </div>
              ))}
            </div>
          </article>
        </section>
      </main>
    </section>
  );
}
