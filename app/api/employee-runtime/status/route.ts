import { NextRequest, NextResponse } from "next/server";
import { requireCompanyContext } from "@/lib/company-os/context";
import { EMPLOYEE_PROFILES } from "@/lib/employee-runtime/registry";
import { resolveEmployeeRuntimeMode } from "@/lib/employee-runtime/runtime";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const requiredTables = [
  "employee_work_orders",
  "employee_work_order_events",
  "employee_execution_receipts",
  "employee_sales_orders",
  "employee_inventory_items",
  "employee_fulfillment_orders",
  "employee_customers",
  "employee_kpi_events",
  "employee_purchase_orders",
  "employee_goods_receipts",
  "employee_payables",
];

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req, "VIEWER");
  if (!auth.ok) return auth.response;
  try {
    const supabase = getSupabaseAdmin();
    const checks: Record<string, boolean> = {};
    if (supabase) {
      await Promise.all(
        requiredTables.map(async (table) => {
          const { error } = await supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .limit(1);
          checks[table] = !error;
        })
      );
    } else {
      for (const table of requiredTables) checks[table] = false;
    }
    const mode = resolveEmployeeRuntimeMode();
    const databaseReady = requiredTables.every((table) => checks[table]);
    return NextResponse.json({
      ok: true,
      ready: databaseReady,
      mode,
      liveSideEffectsEnabled: mode === "LIVE",
      databaseReady,
      tables: checks,
      employees: EMPLOYEE_PROFILES.map((employee) => ({
        id: employee.id,
        name: employee.name,
        title: employee.title,
        department: employee.department,
        backupEmployeeId: employee.backupEmployeeId || null,
        capabilityCount: employee.capabilities.length,
        kpiCount: employee.kpis.length,
      })),
      workflows: [
        "ORDER_TO_CASH",
        "PURCHASE_TO_PAY",
        "IDEA_TO_EXECUTION",
      ],
      requestId: auth.context.requestId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        ready: false,
        error:
          error instanceof Error
            ? error.message
            : "Employee Runtime readiness check failed.",
        requestId: auth.context.requestId,
      },
      { status: 500 }
    );
  }
}
