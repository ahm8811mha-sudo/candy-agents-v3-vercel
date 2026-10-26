"use client";

import { useCallback, useEffect, useState } from "react";
import ChairmanCommandComposer, { type IssuedCommand } from "./ChairmanCommandComposer";
import { commandStatusLabel } from "@/lib/company/commandStatusLabel";

export default function ChairmanCommandBoard() {
  const [commands, setCommands] = useState<IssuedCommand[]>([]);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [currentId, setCurrentId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/commands", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok || !Array.isArray(json.commands)) throw new Error(json.message || "تعذر قراءة الأوامر.");
      setCommands(json.commands);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر قراءة الأوامر.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 15_000);
    function onVisible() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  useEffect(() => {
    function syncHash() {
      setCurrentId(window.location.hash.replace(/^#/, ""));
    }
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  useEffect(() => {
    if (!currentId || !ready) return;
    document.getElementById(currentId)?.scrollIntoView({ block: "start" });
  }, [currentId, ready]);

  function remember(command: IssuedCommand) {
    setCommands((current) => [command, ...current.filter((item) => item.id !== command.id)]);
    setCurrentId(command.id);
    window.history.replaceState(null, "", `#${command.id}`);
  }

  return (
    <main className="workspace command-board">
      <header className="workspace-heading">
        <div>
          <h1>الأوامر</h1>
          <p className="workspace-intro">كل أمر صدر من رئيس مجلس الإدارة، ومالكه، وخطوته، وما يوقفه، ونتيجته.</p>
        </div>
      </header>
      <ChairmanCommandComposer onIssued={remember} />
      {error ? <p className="order-feedback" role="alert">{error}</p> : null}
      {!ready ? <p className="workspace-empty" role="status">جارٍ قراءة الأوامر…</p> : null}
      {ready && commands.length === 0 ? <p className="workspace-empty">لا أوامر مسجّلة بعد.</p> : null}
      <div className="command-list">
        {commands.map((command) => (
          <article id={command.id} key={command.id} className={command.id === currentId ? "command-card is-current" : "command-card"}>
            <h3>{command.subject}</h3>
            <dl className="command-facts">
              <div><dt>المسؤول</dt><dd>{command.ownerName}</dd></div>
              <div><dt>الحالة</dt><dd>{commandStatusLabel(command.status)}</dd></div>
              <div><dt>الخطوة</dt><dd>{command.currentStep || "لم تبدأ"}</dd></div>
              <div><dt>العوائق</dt><dd>{command.blockers?.length ? command.blockers.join(" · ") : "لا عوائق"}</dd></div>
              <div><dt>النتيجة والدليل</dt><dd className="command-result">{command.resultReport || "لا نتيجة بعد."}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </main>
  );
}
