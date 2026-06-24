import DepartmentPage from "@/components/DepartmentPage";

export default function MarketingPage() {
  return (
    <DepartmentPage
      title="إدارة التسويق"
      subtitle="صفحة مستقلة لإدارة الحملات، الجمهور المستهدف، الميزانيات التسويقية، ومؤشرات الأداء."
      badge="Marketing OS"
      icon="marketing"
      capabilities={["إدارة الحملات", "تحليل الجمهور", "ميزانية التسويق", "تقرير KPIs"]}
    />
  );
}
