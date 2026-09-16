"use client";

import type { ReactNode } from "react";

/**
 * Unified Orvanta identity (teal-black drawn from the brand mark) applied
 * app-wide — the facade and every section behind it share one world.
 */
export default function ThemeShell({ children }: { children: ReactNode }) {

  return (
    <div data-theme="orvanta" className="app-shell">
      <div className="app-view">
        {children}
      </div>
    </div>
  );
}
