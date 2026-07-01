import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import ThemeShell from "@/components/ThemeShell";

export const metadata: Metadata = {
  title: "Candy Agents | AI Business Operating System",
  description:
    "نظام وكلاء ذكاء اصطناعي لتحليل السوق واختيار الفرص وتحويل القرارات إلى تنفيذ.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <ThemeShell>
          <AppHeader />
          {children}
        </ThemeShell>
      </body>
    </html>
  );
}
