import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { runIdeaToExecution } from "@/lib/employee-runtime/runtime";
import type { EmployeeRiskLevel } from "@/lib/employee-runtime/types";

export const dynamic = "force-dynamic";

const riskLevels: EmployeeRiskLevel[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
];

export async function POST(req: NextRequest) {
  const auth = await requireCompanyContext(req, "MANAGER");
  if (!auth.ok) return auth.response;
  try {
    const body = await req.json().catch(() => ({}));
    const requestedRisk = String(body.riskLevel || "MEDIUM").toUpperCase();
    const riskLevel = riskLevels.includes(requestedRisk as EmployeeRiskLevel)
      ? (requestedRisk as EmployeeRiskLevel)
      : "MEDIUM";
    const result = await runIdeaToExecution({
      tenantId: auth.context.tenantId,
      ideaId: String(body.ideaId || ""),
      title: body.title ? String(body.title) : undefined,
      budgetSAR: Number(body.budgetSAR || 0),
      approved: body.approved === true,
      riskLevel,
      requestedBy: auth.context.actor.name,
      unavailableEmployeeIds: Array.isArray(body.unavailableEmployeeIds)
        ? body.unavailableEmployeeIds.map(String)
        : [],
    });
    return NextResponse.json(
      { ok: true, ...result, requestId: auth.context.requestId },
      { status: result.reused ? 200 : 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Idea-to-execution failed.",
        requestId: auth.context.requestId,
      },
      { status: 400 }
    );
  }
}
