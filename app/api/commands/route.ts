import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { createTask } from "@/lib/repository";

function classifyDepartment(command: string) {
  if (/مبيعات|عميل|توزيع|تحصيل/.test(command)) return "sales";
  if (/مصنع|إنتاج|جودة|مخزون|شحنة|منتج/.test(command)) return "factory";
  if (/مالي|محاسبة|فاتورة|قيد|اعتماد/.test(command)) return "finance";
  return "exec";
}

function managerForDepartment(departmentId: string) {
  if (departmentId === "sales") return "e-sales-manager";
  if (departmentId === "factory") return "e-factory-manager";
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
      priority: "HIGH",
    });

    return NextResponse.json({ ok: true, task, routedTo: assignedTo, departmentId });
  } catch (error) {
    await logError("CEO_COMMAND_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to execute command" }, { status: 500 });
  }
}
