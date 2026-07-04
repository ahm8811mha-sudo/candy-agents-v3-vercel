import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./brand.css";
import ThemeShell from "@/components/ThemeShell";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Orvanta | AI Operating System for Business",
  description:
    "أورفانتا — نظام تشغيل ذكي للأعمال والتجارة والاستثمار، يدير القرارات والمشاريع عبر AI Agents.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <ThemeShell>
          <AppShell>{children}</AppShell>
        </ThemeShell>
      </body>
    </html>
  );
}
