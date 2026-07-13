import Link from "next/link";
import {
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
  { href: "/departments/sales", title: "المبيعات وCRM", desc: "العملاء والفرص ومسار المبيعات", icon: Users },
  { href: "/sales", title: "المتجر والمبيعات", desc: "المبيعات التشغيلية والقنوات التجارية", icon: ShoppingBag },
  { href: "/departments/marketing", title: "النمو والتسويق", desc: "الحملات والتحليل والنمو", icon: Megaphone },
  { href: "/departments/operations", title: "العمليات", desc: "الإنتاج والجودة والتنفيذ اليومي", icon: Settings2 },
  { href: "/departments/procurement", title: "المشتريات والمخزون", desc: "الموردون والطلبات والمخزون", icon: PackageSearch },
  { href: "/departments/government-relations", title: "العلاقات الحكومية", desc: "الوثائق والمعاملات والمواعيد النظامية", icon: Landmark },
  { href: "/departments/supply-chain", title: "سلاسل الإمداد", desc: "التوريد والتسليم والمخاطر اللوجستية", icon: Boxes },
];

export default function DepartmentsPage() {
  return (
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <span className="eyebrow"><Users size={16} /> Departments</span>
          <h1 className="glow-title">الأقسام</h1>
          <p className="page-sub">بوابة واحدة لجميع الوحدات المتخصصة. لا تظهر الوحدات التجريبية في التنقل الرئيسي.</p>
        </div>
      </header>

      <section className="bento-grid three">
        {departments.map((department) => {
          const Icon = department.icon;
          return (
            <Link key={department.href} href={department.href} className="bento-card" style={{ textDecoration: "none", minHeight: 180 }}>
              <span className="mini-pill" style={{ width: "fit-content" }}><Icon size={14} /> قسم</span>
              <h2 style={{ margin: "8px 0 4px", color: "var(--text-strong)" }}>{department.title}</h2>
              <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.8 }}>{department.desc}</p>
              <span style={{ marginTop: "auto", color: "var(--blue)", fontWeight: 800 }}>فتح القسم ←</span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
