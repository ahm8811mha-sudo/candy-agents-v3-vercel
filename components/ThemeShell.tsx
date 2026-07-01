"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// /dashboard → ceo (فاتح Apple) · /office → office (دافئ) · الباقي → dark (الافتراضي)
function themeForPath(pathname: string): "dark" | "ceo" | "office" {
  if (pathname.startsWith("/dashboard")) return "ceo";
  if (pathname.startsWith("/office")) return "office";
  return "dark";
}

export default function ThemeShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const theme = themeForPath(pathname);

  return (
    <div data-theme={theme} className="app-shell">
      {/* المفتاح على theme يُعيد تشغيل انتقال الظهور الناعم لكل سطح */}
      <div key={theme} className="app-view">
        {children}
      </div>
    </div>
  );
}
