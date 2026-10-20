import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCompanyContext } from "@/lib/company-os/context";
import { ProofError } from "@/lib/executionProofs/rules";
import { createUploadSlot, getProof, openProofFile, registerProofFile, startProof, type ProofActor } from "@/lib/executionProofs/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Registering a file downloads, fingerprints and may read it.
export const maxDuration = 300;

const fileName = z.string().trim().min(1).max(200);
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), taskId: z.string().trim().min(1).max(180) }),
  z.object({ action: z.literal("slot"), proofId: z.string().uuid(), fileName, mimeType: z.string().max(100), sizeBytes: z.number().int() }),
  z.object({ action: z.literal("register"), proofId: z.string().uuid(), path: z.string().min(1).max(400), fileName }),
  z.object({ action: z.literal("open"), fileId: z.string().uuid() }),
]);

type Context = { tenantId: string; actor: { id: string; role: string }; systemCall?: boolean };

function actorOf(context: Context): ProofActor {
  return { tenantId: context.tenantId, actorId: context.actor.id, actorRole: context.actor.role, systemCall: Boolean(context.systemCall) };
}

function failure(error: unknown) {
  if (error instanceof ProofError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }
  console.error("execution proof failed", error);
  return NextResponse.json(
    { ok: false, code: "UNEXPECTED", message: "تعذر إكمال العملية، ولم يتغير شيء في الإثبات. أعد المحاولة." },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "EMPLOYEE");
  if (!auth.ok) return auth.response;
  const parsed = inputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, code: "INVALID_INPUT", message: "طلب غير صالح." }, { status: 400 });
  const actor = actorOf(auth.context);
  const input = parsed.data;
  try {
    switch (input.action) {
      case "start":
        return NextResponse.json({ ok: true, proof: await startProof(actor, input.taskId) });
      case "slot":
        return NextResponse.json({ ok: true, ...(await createUploadSlot(actor, input.proofId, { fileName: input.fileName, mimeType: input.mimeType, sizeBytes: input.sizeBytes })) });
      case "register":
        return NextResponse.json({ ok: true, proof: await registerProofFile(actor, input.proofId, input.path, input.fileName) });
      case "open":
        return NextResponse.json({ ok: true, ...(await openProofFile(actor, input.fileId)) });
    }
  } catch (error) {
    return failure(error);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "EMPLOYEE");
  if (!auth.ok) return auth.response;
  const proofId = z.string().uuid().safeParse(req.nextUrl.searchParams.get("proofId"));
  if (!proofId.success) return NextResponse.json({ ok: false, code: "INVALID_INPUT", message: "طلب غير صالح." }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, proof: await getProof(actorOf(auth.context), proofId.data) });
  } catch (error) {
    return failure(error);
  }
}
