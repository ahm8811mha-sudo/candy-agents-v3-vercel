import DepartmentPage from "@/components/DepartmentPage";

export default function SupplyChainPage() {
  return (
    <DepartmentPage
      title="سلسلة الإمداد"
      subtitle="صفحة مستقلة للمخزون، الموردين، اللوجستيات، وتحسين سلسلة التوريد."
      badge="Supply OS"
      icon="supply"
      capabilities={["إدارة المخزون", "استراتيجية الموردين", "اللوجستيات", "تحسين التكلفة"]}
    />
  );
}
