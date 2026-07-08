"use client";

/**
 * Realtime-lite client hook: polls the ~100-byte /api/company/feed cursor and
 * invokes the callback only when the fingerprint actually changes — so lists
 * feel live without heavyweight refetch loops.
 */

import { useEffect, useRef } from "react";

export function useLiveRefresh(onChange: () => void, intervalMs = 10_000) {
  const versionRef = useRef<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const res = await fetch("/api/company/feed", { cache: "no-store" });
        const json = await res.json();
        if (!alive || !json.ok) return;
        if (versionRef.current !== null && versionRef.current !== json.version) {
          onChangeRef.current();
        }
        versionRef.current = json.version;
      } catch {
        // silent — next tick retries
      }
    }
    tick();
    const t = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [intervalMs]);
}
