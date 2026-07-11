import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import {
  addGovernmentRegulatorySource,
  createGovernmentRenewalPlan,
  deleteGovernmentDocument,
  prepareDigitalRenewal,
  refreshGovernmentFees,
  refreshGovernmentRegulations,
  reviewGovernmentRegulatoryUpdate,
  seedGovernmentRelationsOS,
  syncGovernmentDocumentCompliance,
  updateGovernmentDocument,
  updateGovernmentRenewalTask,
} from "@/lib/governmentRelations";
import {
  assertGovernmentEntityTenant,
  createGovernmentFilePreview,
  getGovernmentRelationsDashboard,
  reanalyzeGovernmentDocument,
  uploadAndAutomateGovernmentDocument,
  type GovernmentContext,
  type GovernmentUploadInput,
} from "@/lib/governmentRelationsV2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type JsonBody = Record<string, unknown> & {
  action?: string;
  data?: Record<string, unknown>;
};

function governmentContext(auth: Awaited<ReturnType<typeof requireCompanyContext>>): GovernmentContext {
  if (!auth.ok) throw new Error("Authentication context unavailable.");
  return {
    tenantId: auth.context.tenantId,
    actorId: auth.context.actor.id,
    actorRole: auth.context.actor.role,
    actorName: auth.context.actor.name,
    correlationId: auth.context.correlationId,
  };
}

async function parseRequest(req: NextRequest): Promise<{ action: string; body: JsonBody; upload?: GovernmentUploadInput }> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const action = String(form.get("action") || "upload-document");
    const candidate = form.get("file");
    if (!(candidate instanceof File)) {
      return { action, body: {} };
    }
    const buffer = Buffer.from(await candidate.arrayBuffer());
    return {
      action,
      body: {},
      upload: {
        documentType: String(form.get("documentType") || ""),
        title: String(form.get("title") || ""),
        issuer: String(form.get("issuer") || ""),
        notes: String(form.get("notes") || ""),
        fileName: candidate.name,
        mimeType: candidate.type || "application/octet-stream",
        fileBase64: buffer.toString("base64"),
      },
    };
  }

  const body = (await req.json().catch(() => ({}))) as JsonBody;
  const action = String(body.action || "seed");
  const data = (body.data || {}) as Record<string, unknown>;
  const upload = action === "upload-document" && data.fileBase64
    ? {
        documentType: String(data.documentType || ""),
        title: String(data.title || ""),
        issuer: String(data.issuer || ""),
        notes: String(data.notes || ""),
        fileName: String(data.fileName || "government-document"),
        mimeType: String(data.mimeType || "application/octet-stream"),
        fileBase64: String(data.fileBase64 || ""),
      }
    : undefined;
  return { action, body, upload };
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    await seedGovernmentRelationsOS();
    const data = await getGovernmentRelationsDashboard(governmentContext(auth));
    return NextResponse.json({ ok: true, ...data, requestId: auth.context.requestId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Government relations OS failed",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  const context = governmentContext(auth);

  try {
    const { action, body, upload } = await parseRequest(req);

    if (action === "seed") {
      await seedGovernmentRelationsOS();
      const data = await getGovernmentRelationsDashboard(context);
      return NextResponse.json({ ok: true, ...data, requestId: auth.context.requestId });
    }

    if (action === "upload-document") {
      if (!upload) throw new Error("اختر ملفاً صالحاً أولاً.");
      await seedGovernmentRelationsOS();
      const result = await uploadAndAutomateGovernmentDocument(context, upload);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId }, { status: 201 });
    }

    if (action === "reanalyze-document") {
      const documentId = String(body.documentId || "");
      await assertGovernmentEntityTenant(context, "gov_documents", "id", documentId);
      const result = await reanalyzeGovernmentDocument(context, documentId);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "preview-file") {
      const result = await createGovernmentFilePreview(context, String(body.fileId || ""));
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "update-document") {
      const documentId = String(body.documentId || "");
      await assertGovernmentEntityTenant(context, "gov_documents", "id", documentId);
      const result = await updateGovernmentDocument(documentId, (body.data || {}) as Record<string, unknown>);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "delete-document") {
      const documentId = String(body.documentId || "");
      await assertGovernmentEntityTenant(context, "gov_documents", "id", documentId);
      const result = await deleteGovernmentDocument(
        documentId,
        String(body.confirmationTitle || ""),
        context.actorRole
      );
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "refresh-fees") {
      const result = await refreshGovernmentFees();
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "refresh-regulations") {
      const result = await refreshGovernmentRegulations({ force: true });
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "sync-compliance") {
      const result = await syncGovernmentDocumentCompliance();
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "add-regulatory-source") {
      const result = await addGovernmentRegulatorySource((body.data || {}) as any);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "review-regulatory-update") {
      const updateId = String(body.updateId || "");
      await assertGovernmentEntityTenant(context, "gov_regulatory_updates", "id", updateId);
      const status = body.status === "MONITORING" ? "MONITORING" : "RESOLVED";
      const result = await reviewGovernmentRegulatoryUpdate(updateId, status);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "update-renewal-task") {
      const taskId = String(body.taskId || "");
      await assertGovernmentEntityTenant(context, "gov_renewal_tasks", "id", taskId);
      const result = await updateGovernmentRenewalTask(taskId, String(body.status || "OPEN"));
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "renewal-plan") {
      const documentId = String(body.documentId || "");
      await assertGovernmentEntityTenant(context, "gov_documents", "id", documentId);
      const result = await createGovernmentRenewalPlan(documentId);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    if (action === "prepare-renewal") {
      const documentId = String(body.documentId || "");
      await assertGovernmentEntityTenant(context, "gov_documents", "id", documentId);
      const result = await prepareDigitalRenewal(documentId);
      return NextResponse.json({ ok: true, result, requestId: auth.context.requestId });
    }

    return NextResponse.json(
      { ok: false, error: "Invalid government relations action", requestId: auth.context.requestId },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Government relations action failed",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}
