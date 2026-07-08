import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./brand.css";
import "./orvanta-exact-logo.css";
import "./orvanta-logo-final.css";
import ThemeShell from "@/components/ThemeShell";
import AppShell from "@/components/AppShell";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "Orvanta | AI Operating System for Business",
  description: "Orvanta business AI operating system.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Orvanta", statusBarStyle: "default" },
  openGraph: {
    title: "Orvanta | AI Operating System for Business",
    description: "Orvanta business AI operating system.",
  },
};

export const viewport = {
  themeColor: "#13315c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <ThemeShell>
          <AppShell>{children}</AppShell>
        </ThemeShell>
        <PwaRegister />
      </body>
    </html>
  );
}
