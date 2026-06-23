import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { createDailyLog, createTask } from "@/lib/repository";

function classifyDepartment(command: string) {
  if (/مبيعات|عميل|توزيع|تحصيل/.test(command)) return "sales";
  if (/مصنع|إنتاج|جودة|مخزون|شحنة|منتج/.test(command)) return "factory";
  if (/مالي|محاسبة|فاتورة|قيد|اعتماد/.test(command)) return "finance";
  return "exec";
}

function managerForDepartment(departmentId: string) {
  if (departmentId === "sales") return "e-sales-manager";
  if (departmentId === "factory") return "e-factory-manager";
  if (departmentId === "finance") return "e-finance-manager";
  return "e-ceo";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const command = String(body.command ?? "").trim();
    if (command.length < 3) {
      return NextResponse.json({ ok: false, message: "Command is required" }, { status: 400 });
    }

    const departmentId = classifyDepartment(command);
    const assignedTo = managerForDepartment(departmentId);
    const task = await createTask({
      title: `أمر تنفيذي: ${command.slice(0, 70)}`,
      description: command,
      assignedTo,
      createdBy: "e-ceo",
      departmentId,
      priority: body.priority || "HIGH",
    });

    const report = await createDailyLog({
      employeeId: assignedTo,
      summary: `تقرير متابعة أولي: تم استلام الأمر التنفيذي وتحويله إلى مهمة موجهة. نص الأمر: ${command}`,
      blockers: "بانتظار تنفيذ المدير المختص وتحديث التقدم.",
      progressScore: 1,
    });

    return NextResponse.json({ ok: true, task, report, routedTo: assignedTo, departmentId });
  } catch (error) {
    await logError("CEO_COMMAND_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to execute command" }, { status: 500 });
  }
}
