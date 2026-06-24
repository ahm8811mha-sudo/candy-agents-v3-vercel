import CompanyOS from "@/components/CompanyOS";
import StrategyRunner from "@/components/StrategyRunner";
import { listActivity, listApprovals, listDailyLogs, listDepartments, listEmployees, listNotifications, listTasks } from "@/lib/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const employees = await listEmployees();
  const departments = await listDepartments();
  const tasks = await listTasks();
  const dailyLogs = await listDailyLogs();
  const approvals = await listApprovals();
  const notifications = await listNotifications();
  const activityLogs = await listActivity();

  return (
    <>
      <CompanyOS
        employees={employees}
        departments={departments}
        tasks={tasks}
        dailyLogs={dailyLogs}
        approvals={approvals}
        notifications={notifications}
        activityLogs={activityLogs}
      />
      <main className="main">
        <StrategyRunner />
      </main>
    </>
  );
}
