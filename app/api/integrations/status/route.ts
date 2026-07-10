import { NextResponse } from "next/server";
import {
  getCompanyActionIntegrationPlan,
  SUPPORTED_INTEGRATION_ACTION_TYPES,
} from "@/lib/integrations/companyActionExecutor";
import { getGoogleWorkspaceStatus } from "@/lib/integrations/googleWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Safe readiness endpoint. It exposes only booleans and missing variable names,
 * never credential values, so the Action Queue can explain why a connector is blocked.
 */
export async function GET() {
  const googleWorkspace = getGoogleWorkspaceStatus();
  const actionPlans = Object.fromEntries(
    SUPPORTED_INTEGRATION_ACTION_TYPES.map((actionType) => [
      actionType,
      getCompanyActionIntegrationPlan({ action_type: actionType, payload: null }),
    ])
  );

  return NextResponse.json({
    ok: true,
    googleWorkspace,
    supportedActionTypes: SUPPORTED_INTEGRATION_ACTION_TYPES,
    actionPlans,
  });
}
