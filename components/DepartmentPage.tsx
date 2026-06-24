import { ArrowRight, Boxes, Building2, ClipboardList, Megaphone, ShieldCheck } from "lucide-react";
import Link from "next/link";

type Props = {
  title: string;
  subtitle: string;
  badge: string;
  icon: "marketing" | "operations" | "supply" | "executive";
  capabilities: string[];
};

const icons = {
  marketing: Megaphone,
  operations: ClipboardList,
  supply: Boxes,
  executive: ShieldCheck,
};

export default function DepartmentPage({ title, subtitle, badge, icon, capabilities }: Props) {
  const Icon = icons[icon];

  return (
    <main className="company-app">
      <section className="department-hero">
        <div>
          <Link className="back-link" href="/"><ArrowRight size={16} /> العودة للشركة</Link>
          <span className="eyebrow"><Icon size={16} /> {title}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="department-badge">{badge}</div>
      </section>

      <section className="delivery-panel">
        <div className="delivery-header">
          <div>
            <span className="eyebrow"><Building2 size={16} /> نظام الإدارة</span>
            <h2>ما ستديره هذه الصفحة</h2>
          </div>
          <span className="status-pill">جاهزة للتطوير</span>
        </div>

        <div className="department-capabilities">
          {capabilities.map((item) => (
            <article className="employee-card" key={item}>
              <span><Icon size={18} /></span>
              <strong>{item}</strong>
              <small>سيتم تحويلها إلى أدوات تشغيل وربط بيانات وقرارات AI.</small>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
