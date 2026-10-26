import type { Metadata } from "next";
import { TermsOfUse } from "@/components/PublicDocument";

export const metadata: Metadata = {
  title: "الشروط",
  description: "شروط استخدام أورفانتا، نظام تشغيل الأعمال الداخلي الذي تديره أورفانتا.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <TermsOfUse />;
}
