import CompanyOS from "@/components/CompanyOS";
import { activityLogs, approvals, dailyLogs, departments, employees, notifications, tasks } from "@/lib/mock-data";

export default function HomePage() {
  return (
    <CompanyOS
      employees={employees}
      departments={departments}
      tasks={tasks}
      dailyLogs={dailyLogs}
      approvals={approvals}
      notifications={notifications}
      activityLogs={activityLogs}
    />
  );
}
