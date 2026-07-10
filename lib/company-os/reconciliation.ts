import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import type { CompanyAction } from "../company/actionQueue";
import { reconcileExecution } from "./finance";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export function externalReferenceFromOutput(output: Record<string, unknown>) {
  return (
    text(output.messageId) ||
    text(output.draftId) ||
    text(output.fileId) ||
    text(output.spreadsheetId) ||
    text(output.externalReference) ||
    text(output.id)
  );
}

async function hasBalancedLedgerReference(tenantId: string, reference?: string) {
  if (!reference) return false;
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id,lines")
    .eq("tenant_id", tenantId)
    .eq("reference", reference)
    .maybeSingle();
  if (error || !data) return false;
  const lines = Array.isArray(data.lines) ? data.lines as Array<Record<string, unknown>> : [];
  const debit = lines.reduce((sum, line) => sum + Number(line.debit || line.debitSAR || 0), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit || line.creditSAR || 0), 0);
  return lines.length > 0 && Math.abs(debit - credit) < 0.01;
}

export async function reconcileCompanyAction(input: {
  tenantId: string;
  action: CompanyAction;
  output: Record<string, unknown>;
  actor: string;
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is required for action reconciliation.");

  const payload = asRecord(input.action.payload);
  const integration = asRecord(payload.integration);
  const expectedAmountSAR = number(integration.expectedAmountSAR ?? payload.expectedAmountSAR);
  const actualAmountSAR = number(input.output.actualAmountSAR ?? input.output.amountSAR);
  const expectedExternalReference = text(integration.expectedExternalReference ?? payload.expectedExternalReference);
  const actualExternalReference = externalReferenceFromOutput(input.output);
  const ledgerReference = text(input.output.ledgerReference ?? integration.ledgerReference ?? payload.ledgerReference);
  const financial = expectedAmountSAR != null || actualAmountSAR != null;
  const ledgerBalanced = financial ? await hasBalancedLedgerReference(input.tenantId, ledgerReference) : true;

  const result = reconcileExecution({
    expectedAmountSAR,
    actualAmountSAR,
    expectedExternalReference,
    actualExternalReference,
    ledgerBalanced,
    receiptPresent: Boolean(actualExternalReference),
  });

  const reconciliationId = randomUUID();
  const { data, error } = await supabase
    .from("execution_reconciliations")
    .upsert(
      {
        id: reconciliationId,
        tenant_id: input.tenantId,
        action_id: input.action.id,
        external_reference: actualExternalReference || `missing:${input.action.id}`,
        expected_result: {
          expectedAmountSAR: expectedAmountSAR ?? null,
          expectedExternalReference: expectedExternalReference || null,
        },
        actual_result: input.output,
        financial_entry_reference: ledgerReference || null,
        status: result.status,
        exception_reason: result.exceptions.length ? result.exceptions.join(",") : null,
        reconciled_by: result.reconciled ? input.actor : null,
        reconciled_at: result.reconciled ? new Date().toISOString() : null,
      },
      { onConflict: "tenant_id,action_id" }
    )
    .select("*")
    .single();
  if (error) throw error;

  return {
    ...result,
    id: data.id,
    externalReference: actualExternalReference,
    ledgerReference,
    financial,
  };
}

export async function getReconciliationForAction(tenantId: string, actionId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("execution_reconciliations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("action_id", actionId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}
