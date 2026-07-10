import Link from "next/link";
import OrvantaLogo from "@/components/OrvantaLogo";

export default function NotFound() {
  return (
    <section className="brand-not-found">
      <div className="brand-state-card">
        <OrvantaLogo size={220} priority />
        <h1>هذه الشاشة غير موجودة</h1>
        <p>قد يكون الرابط قديمًا أو نُقلت الصفحة إلى قسم آخر داخل Orvanta.</p>
        <Link className="primary-btn" href="/">
          العودة إلى نظرة عامة
        </Link>
      </div>
    </section>
  );
}
