export default function WorkflowPanel() {
  return (
    <section className="bento-card bento-full" style={{ gap: 12 }}>
      <span className="bento-kicker">Workflows</span>
      <strong style={{ color: "var(--text-strong)", fontSize: "1.1rem" }}>Workflow Center</strong>
      <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.8 }}>
        This panel organizes operational requests with a clear review checkpoint before final completion.
      </p>
    </section>
  );
}
