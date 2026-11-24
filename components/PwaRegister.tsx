"use client";
import { useEffect } from "react";

const NOTIFIED_KEY = "orvanta-stale-notified";
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update()).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || typeof Notification === "undefined") return;
    let busy = false;
    let stopped = false;
    async function checkStale() {
      if (busy || stopped || document.visibilityState !== "visible" || !navigator.onLine || Notification.permission !== "granted" || !navigator.serviceWorker.controller) return;
      busy = true;
      try {
        const res = await fetch("/api/inbox", { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) return;
        const json = await res.json();
        if (stopped || !json.ok || !(json.stale > 0)) return;
        const marker = `${new Date().toISOString().slice(0, 10)}:${json.stale}`;
        if (localStorage.getItem(NOTIFIED_KEY) === marker) return;
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (!registration?.active || stopped) return;
        await registration.showNotification("أورفانتا: قرارات تحتاج المراجعة", {
          body: "افتح التطبيق للاطلاع على القرارات المعلقة.",
          icon: "/icon-192.png",
          tag: "orvanta-stale",
        });
        localStorage.setItem(NOTIFIED_KEY, marker);
      } catch {
        // A notification must never interrupt normal application use.
      } finally { busy = false; }
    }
    void checkStale();
    const timer = window.setInterval(checkStale, 5 * 60_000);
    window.addEventListener("online", checkStale);
    document.addEventListener("visibilitychange", checkStale);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("online", checkStale); document.removeEventListener("visibilitychange", checkStale); };
  }, []);
  return null;
}
