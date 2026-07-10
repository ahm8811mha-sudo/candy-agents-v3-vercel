import OrvantaLogo from "@/components/OrvantaLogo";

export default function Loading() {
  return (
    <section className="brand-loading" aria-live="polite" aria-busy="true">
      <div className="brand-state-card">
        <OrvantaLogo size={230} priority />
        <div className="brand-spinner" aria-hidden="true" />
        <p>جاري تحميل نظام Orvanta…</p>
      </div>
    </section>
  );
}
