export default function ProcessPanel() {
  return (
    <section className="bento-card bento-full" style={{ gap: 12 }}>
      <span className="bento-kicker">Processes</span>
      <strong style={{ color: "var(--text-strong)", fontSize: "1.1rem" }}>Process Center</strong>
      <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.8 }}>
        This panel organizes controlled work requests for the responsible operator.
      </p>
    </section>
  );
}
