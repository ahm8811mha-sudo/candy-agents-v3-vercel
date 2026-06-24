import DepartmentPage from "@/components/DepartmentPage";

export default function ExecutivePage() {
  return (
    <DepartmentPage
      title="الإدارة التنفيذية"
      subtitle="صفحة مستقلة لتجميع تقارير الإدارات، إصدار القرارات، واعتماد مسارات التنفيذ."
      badge="CEO OS"
      icon="executive"
      capabilities={["ملخص تنفيذي", "اعتماد القرارات", "إدارة المخاطر", "متابعة الأداء"]}
    />
  );
}
