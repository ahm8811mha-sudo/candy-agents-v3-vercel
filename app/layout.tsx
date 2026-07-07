import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./brand.css";
import "./orvanta-exact-logo.css";
import ThemeShell from "@/components/ThemeShell";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Orvanta | AI Operating System for Business",
  description:
    "أورفانتا — نظام تشغيل ذكي للأعمال والتجارة والاستثمار، يدير القرارات والمشاريع عبر AI Agents.",
  icons: {
    icon: "/orvanta-logo-exact.svg",
    shortcut: "/orvanta-logo-exact.svg",
    apple: "/orvanta-logo-exact.svg",
  },
  openGraph: {
    title: "Orvanta | AI Operating System for Business",
    description:
      "أورفانتا — نظام تشغيل ذكي للأعمال والتجارة والاستثمار، يدير القرارات والمشاريع عبر AI Agents.",
    images: ["/orvanta-logo-exact.svg"],
  },
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
