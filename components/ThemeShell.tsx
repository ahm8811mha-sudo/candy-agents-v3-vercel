"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Unified corporate identity (Golden Star: ink-navy on white, gold accent)
 * applied app-wide — the company facade and the departments behind it share
 * one world-class corporate language.
 */
export default function ThemeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div data-theme="corporate" className="app-shell">
      {/* keyed per route to re-run the soft view transition */}
      <div key={pathname} className="app-view">
        {children}
      </div>
    </div>
  );
}
