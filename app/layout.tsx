import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import AppNav from "../components/AppNav";

export const metadata: Metadata = {
  title: "Candy Agents | AI Business Operating System",
  description: "نظام وكلاء ذكاء اصطناعي لتحليل السوق واختيار الفرص وتحويل القرارات إلى تنفيذ.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <AppNav />
        {children}
      </body>
    </html>
  );
}
