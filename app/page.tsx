import type { Metadata } from "next";
import { headers } from "next/headers";
import ExecutiveWorkspace from "@/components/ExecutiveWorkspace";
import { PublicHome } from "@/components/PublicDocument";
import { PUBLIC_PAGE_HEADER } from "@/lib/security/publicPages";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  if (headerStore.get(PUBLIC_PAGE_HEADER) !== "1") {
    return { title: "Orvanta | AI Business Operating System" };
  }
  return {
    title: "Orvanta",
    description: "Orvanta is an internal business operating system operated by Orvanta.",
    robots: { index: true, follow: true },
  };
}

export default async function HomePage() {
  const headerStore = await headers();
  if (headerStore.get(PUBLIC_PAGE_HEADER) === "1") return <PublicHome />;
  return <ExecutiveWorkspace />;
}
