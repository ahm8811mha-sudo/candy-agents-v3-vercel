import {
  createGovernmentRenewalPlan,
  createGovernmentDocumentPreview,
  getGovernmentRelationsOS,
  prepareDigitalRenewal,
  refreshGovernmentFees,
  seedGovernmentRelationsOS,
  uploadGovernmentDocument,
} from "@/lib/governmentRelations";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getGovernmentRelationsOS();
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Government relations OS failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "seed");

    if (action === "seed") {
      await seedGovernmentRelationsOS();
      const data = await getGovernmentRelationsOS();
      return NextResponse.json({ ok: true, ...data });
    }

    if (action === "upload-document") {
      const result = await uploadGovernmentDocument(body.data || {});
      return NextResponse.json({ ok: true, result });
    }

    if (action === "refresh-fees") {
      const result = await refreshGovernmentFees();
      return NextResponse.json({ ok: true, result });
    }

    if (action === "renewal-plan") {
      const result = await createGovernmentRenewalPlan(String(body.documentId || ""));
      return NextResponse.json({ ok: true, result });
    }

    if (action === "prepare-renewal") {
      const result = await prepareDigitalRenewal(String(body.documentId || ""));
      return NextResponse.json({ ok: true, result });
    }

    if (action === "preview-file") {
      const result = await createGovernmentDocumentPreview(String(body.fileId || ""), String(body.actorRole || "Government Relations Manager"));
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ ok: false, error: "Invalid government relations action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Government relations action failed" },
      { status: 500 }
    );
  }
}
