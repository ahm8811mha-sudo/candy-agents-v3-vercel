import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isAuthEnabled, requireAuth } from "@/lib/auth";
import {
  getCompanyActionIntegrationPlan,
  SUPPORTED_INTEGRATION_ACTION_TYPES,
} from "@/lib/integrations/companyActionExecutor";
import { getGoogleWorkspaceStatus } from "@/lib/integrations/googleWorkspace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req);
  if (isAuthEnabled()) {
    const authError = requireAuth(user, "VIEWER");
    if (authError) return authError;
  }

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
