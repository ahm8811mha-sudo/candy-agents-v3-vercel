"use client";

/**
 * Roadmap #4 — PWA runtime: registers the service worker (installable app)
 * and raises a local browser notification when pending decisions breach the
 * SLA. Notifications fire only if the user has already granted permission —
 * we never interrupt with a permission prompt.
 */

import { useEffect } from "react";

const NOTIFIED_KEY = "orvanta-stale-notified";

export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (typeof Notification === "undefined") return;

    async function checkStale() {
      if (Notification.permission !== "granted") return;
      try {
        const res = await fetch("/api/inbox", { cache: "no-store" });
        const json = await res.json();
        if (!json.ok || !(json.stale > 0)) return;
        // At most one notification per day per stale-count level.
        const marker = `${new Date().toISOString().slice(0, 10)}:${json.stale}`;
        if (localStorage.getItem(NOTIFIED_KEY) === marker) return;
        localStorage.setItem(NOTIFIED_KEY, marker);
        new Notification("Orvanta — قرارات متأخرة", {
          body: `${json.stale} قرار تجاوز 24 ساعة بانتظار اعتمادك.`,
          icon: "/orvanta-mark.svg",
          tag: "orvanta-stale",
        });
      } catch {
        // silent
      }
    }

    checkStale();
    const t = setInterval(checkStale, 5 * 60_000);
    return () => clearInterval(t);
  }, []);

  return null;
}
