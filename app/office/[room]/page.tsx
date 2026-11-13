import { notFound } from "next/navigation";
import LiveOfficeFloor from "@/components/LiveOfficeFloor";

export const dynamic = "force-dynamic";

const ROOMS = new Set(["executive", "finance", "operations", "revenue", "compliance", "governance"]);

export default async function DepartmentRoomPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  if (!ROOMS.has(room)) notFound();
  return <LiveOfficeFloor room={room} />;
}
