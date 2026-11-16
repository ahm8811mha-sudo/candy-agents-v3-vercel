import SpendFile from "@/components/SpendFile";

export const dynamic = "force-dynamic";

export default async function SpendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SpendFile id={decodeURIComponent(id)} />;
}
