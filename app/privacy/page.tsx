import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/PublicDocument";

export const metadata: Metadata = {
  title: "الخصوصية",
  description: "كيف تستخدم أورفانتا حساب Google الخاص بصاحب الشركة، وما الذي لا يُباع ولا يُشارك.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <PrivacyPolicy />;
}
