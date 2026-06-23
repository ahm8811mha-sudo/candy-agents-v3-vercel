import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { createDailyLog, createTask } from "@/lib/repository";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function classifyDepartment(command: string) {
  if (/مبيعات|عميل|توزيع|تحصيل|تسويق/.test(command)) return "sales";
  if (/مصنع|إنتاج|جودة|مخزون|شحنة|منتج|تشغيل/.test(command)) return "factory";
  if (/مالي|محاسبة|فاتورة|قيد|اعتماد|ميزانية/.test(command)) return "finance";
  return "exec";
}

function managerForDepartment(departmentId: string) {
  if (departmentId === "sales") return "e-sales-manager";
  if (departmentId === "factory") return "e-factory-manager";
  if (departmentId === "finance") return "e-finance-manager";
  return "e-ceo";
}

function agentName(agentId: string) {
  if (agentId === "e-sales-manager") return "وكيل المبيعات";
  if (agentId === "e-factory-manager") return "وكيل التشغيل والمصنع";
  if (agentId === "e-finance-manager") return "وكيل المالية";
  return "الوكيل التنفيذي";
}

function buildResult(command: string, agentId: string) {
  const agent = agentName(agentId);
  const isPlan = /خطة|تشغيل|اشهر|أشهر|استراتيجية|برنامج/.test(command);
  const title = isPlan ? "خطة عمل تنفيذية جاهزة" : "نتيجة تنفيذ الطلب";
  const content = isPlan
    ? `# ${title}\n\nالمنفذ: ${agent}\n\nالطلب: ${command}\n\n## الهدف\nتحويل الطلب إلى برنامج عمل واضح قابل للتنفيذ والمتابعة.\n\n## الشهر الأول: التأسيس\n1. حصر الوضع الحالي والموارد المتاحة.\n2. تحديد المسؤوليات بين الإدارة، المبيعات، التشغيل، والمالية.\n3. بناء جدول مهام أسبوعي واضح.\n4. إنشاء سجل متابعة يومي لكل مسؤول.\n\n## الشهر الثاني: التشغيل والتحسين\n1. تشغيل المهام الأساسية حسب الأولوية.\n2. قياس الأداء أسبوعيًا.\n3. معالجة العوائق التشغيلية.\n4. تحسين توزيع المهام بناءً على النتائج.\n\n## الشهر الثالث: التثبيت والقياس\n1. تثبيت الإجراءات الناجحة كسياسات عمل.\n2. إنشاء تقرير أداء شامل.\n3. تحديد مؤشرات KPI لكل قسم.\n4. رفع توصيات للإدارة التنفيذية.\n\n## مؤشرات المتابعة\n- نسبة إنجاز المهام.\n- عدد العوائق المفتوحة.\n- سرعة إغلاق الطلبات.\n- جودة التقارير اليومية.\n\n## الخطوة التالية\nاعتماد الخطة، ثم تحويل كل بند إلى مهام أسبوعية داخل النظام.`
    : `# ${title}\n\nالمنفذ: ${agent}\n\nالطلب: ${command}\n\n## ما تم عمله\nتم تحليل الطلب، تحويله إلى مهمة تشغيلية، وتحديد المسؤول المختص.\n\n## الإجراء المقترح\n1. تنفيذ المهمة حسب الأولوية.\n2. توثيق النتيجة في تقرير يومي.\n3. رفع أي عوائق للإدارة.\n\n## الحالة\nتم التسليم في سجل الوارد.`;
  return { title, content };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const command = String(body.command ?? "").trim();
    if (command.length < 3) return NextResponse.json({ ok: false, message: "Command is required" }, { status: 400 });

    const departmentId = classifyDepartment(command);
    const assignedTo = managerForDepartment(departmentId);
    const result = buildResult(command, assignedTo);

    const task = await createTask({ title: `طلب: ${command.slice(0, 70)}`, description: command, assignedTo, createdBy: "e-ceo", departmentId, priority: body.priority || "HIGH" });
    const report = await createDailyLog({ employeeId: assignedTo, summary: `تم تنفيذ الطلب وتسليم النتيجة في سجل الوارد: ${result.title}`, blockers: "لا توجد عوائق. النتيجة جاهزة للمراجعة.", progressScore: 10 });

    const supabase = getSupabaseAdmin();
    let inbox = { id: id("inbox"), requestText: command, resultTitle: result.title, resultContent: result.content, assignedAgent: assignedTo, departmentId, taskId: task.id, status: "DELIVERED", createdAt: new Date().toISOString() };
    if (supabase) {
      const { data, error } = await supabase.from("inbox_items").insert({ id: inbox.id, request_text: command, result_title: result.title, result_content: result.content, assigned_agent: assignedTo, department_id: departmentId, task_id: task.id, status: "DELIVERED" }).select().single();
      if (error) throw error;
      inbox = { id: data.id, requestText: data.request_text, resultTitle: data.result_title, resultContent: data.result_content, assignedAgent: data.assigned_agent, departmentId: data.department_id, taskId: data.task_id, status: data.status, createdAt: data.created_at };
    }

    return NextResponse.json({ ok: true, task, report, inbox, routedTo: assignedTo, departmentId });
  } catch (error) {
    await logError("CEO_COMMAND_FAILED", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Failed to execute command" }, { status: 500 });
  }
}
