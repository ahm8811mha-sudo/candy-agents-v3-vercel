"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Unified Orvanta identity (teal-black drawn from the brand mark) applied
 * app-wide — the facade and every section behind it share one world.
 */
export default function ThemeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div data-theme="orvanta" className="app-shell">
      {/* keyed per route to re-run the soft view transition */}
      <div key={pathname} className="app-view">
        {children}
      </div>
    </div>
  );
}
