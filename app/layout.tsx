import type { Metadata } from "next";
import type { ReactNode } from "react";
import NavFix from "@/components/NavFix";
import AgentInboxWidget from "@/components/AgentInboxWidget";
import "./globals.css";

export const metadata: Metadata = {
  title: "Golden Star Enterprise OS",
  description: "Company management platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body><NavFix />{children}<AgentInboxWidget /></body>
    </html>
  );
}
