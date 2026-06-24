import DepartmentPage from "@/components/DepartmentPage";

export default function OperationsPage() {
  return (
    <DepartmentPage
      title="إدارة العمليات"
      subtitle="صفحة مستقلة لتحويل القرارات إلى مهام، موارد، جداول زمنية، ومتابعة تنفيذ."
      badge="Operations OS"
      icon="operations"
      capabilities={["خطة التنفيذ", "توزيع الموارد", "الجدول الزمني", "متابعة المخاطر"]}
    />
  );
}
