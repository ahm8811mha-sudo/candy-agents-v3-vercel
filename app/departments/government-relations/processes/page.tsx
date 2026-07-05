import ProcessPanel from "@/components/ProcessPanel";

export const dynamic = "force-dynamic";

export default function ProcessesPage() {
  return (
    <main className="page-wrap">
      <section className="hero-scenic" style={{ textAlign: "start", justifyItems: "stretch" }}>
        <span className="hero-pill">Relations Operations</span>
        <h1 className="hero-title" style={{ maxWidth: "none" }}>Process Center</h1>
        <p className="hero-sub" style={{ maxWidth: 820 }}>
          Controlled work queue for the responsible operator with owner review before final completion.
        </p>
      </section>
      <ProcessPanel />
    </main>
  );
}
