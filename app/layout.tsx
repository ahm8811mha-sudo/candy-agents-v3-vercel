import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./brand.css";
import "./facade.css";
import "./orvanta-exact-logo.css";
import "./orvanta-logo-final.css";
import ThemeShell from "@/components/ThemeShell";
import AppShell from "@/components/AppShell";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://candy-agents-v3-vercel.vercel.app"
  ),
  title: {
    default: "Orvanta | AI Business Operating System",
    template: "%s | Orvanta",
  },
  description:
    "أورفانتا نظام تشغيل ذكي للأعمال والتجارة والاستثمار، يحوّل الأفكار والقرارات إلى مشاريع ومهام ومؤشرات تنفيذ قابلة للتتبع.",
  applicationName: "Orvanta",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/orvanta-mark.svg", type: "image/svg+xml" }],
    shortcut: "/orvanta-mark.svg",
    apple: "/orvanta-mark.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Orvanta",
    statusBarStyle: "default",
  },
  openGraph: {
    type: "website",
    locale: "ar_SA",
    siteName: "Orvanta",
    title: "Orvanta | AI Business Operating System",
    description:
      "من القرار إلى التنفيذ عبر وكلاء ذكاء اصطناعي، حوكمة تشغيلية، ومركز قرار موحّد.",
    images: [
      {
        url: "/orvanta-logo.svg",
        width: 740,
        height: 453,
        alt: "Orvanta",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Orvanta | AI Business Operating System",
    description: "من القرار إلى التنفيذ عبر نظام تشغيل أعمال مدعوم بالذكاء الاصطناعي.",
    images: ["/orvanta-logo.svg"],
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#061418",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
