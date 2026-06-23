import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Star Enterprise OS",
  description: "Internal company management system for employees, tasks, approvals, logs, analytics, and realtime activity.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
