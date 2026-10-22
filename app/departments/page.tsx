import Link from "next/link";
import {
  ArrowUpLeft,
  Boxes,
  Calculator,
  Landmark,
  Megaphone,
  PackageSearch,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";

const departments = [
  { href: "/departments/executive", title: "المكتب التنفيذي", desc: "السياسات والقرارات والتوجيه التنفيذي", icon: ShieldCheck },
  { href: "/departments/finance", title: "المالية والمحاسبة", desc: "القيود والفواتير والضرائب والتقارير", icon: Calculator },
  { href: "/departments/sales", title: "المبيعات وعلاقات العملاء", desc: "العملاء والفرص ومسار المبيعات", icon: Users },
  { href: "/sales", title: "المتجر والمبيعات", desc: "المبيعات التشغيلية والقنوات التجارية", icon: ShoppingBag },
  { href: "/departments/marketing", title: "النمو والتسويق", desc: "الحملات والتحليل والنمو", icon: Megaphone },
  { href: "/departments/operations", title: "إدارة العمليات", desc: "الإنتاج والجودة والتنفيذ اليومي", icon: Settings2 },
  { href: "/departments/procurement", title: "المشتريات والمخزون", desc: "الموردون والطلبات والمخزون", icon: PackageSearch },
  { href: "/departments/government-relations", title: "العلاقات الحكومية", desc: "الوثائق والمعاملات والمواعيد النظامية", icon: Landmark },
  { href: "/departments/supply-chain", title: "سلسلة الإمداد", desc: "التوريد والتسليم والمخاطر اللوجستية", icon: Boxes },
];

export default function DepartmentsPage() {
  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <h1 className="glow-title">الأقسام</h1>
          <p className="page-sub">كل وحدات الشركة المتخصصة في مكان واحد.</p>
        </div>
      </header>

      <section className="department-index" aria-label="أقسام الشركة">
        {departments.map((department) => {
          const Icon = department.icon;
          return (
            <Link key={department.href} href={department.href} className="department-index__item">
              <Icon size={22} aria-hidden="true" />
              <h2>{department.title}</h2>
              <p>{department.desc}</p>
              <span>فتح القسم <ArrowUpLeft size={15} aria-hidden="true" /></span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
