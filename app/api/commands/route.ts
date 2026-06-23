import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { createDailyLog, createTask } from "@/lib/repository";
import { getSupabaseAdmin } from "@/lib/supabase";

const id = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function classifyDepartment(command: string) {
  if (/مبيعات|عميل|توزيع|تحصيل|تسويق/.test(command)) return "sales";
  if (/مالي|محاسبة|فاتورة|قيد|اعتماد|ميزانية|مصروف|شراء|مورد/.test(command)) return "finance";
  if (/مصنع|إنتاج|جودة|مخزون|شحنة|منتج|تشغيل/.test(command)) return "factory";
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
  if (agentId === "e-factory-manager") return "وكيل التشغيل والجودة";
  if (agentId === "e-finance-manager") return "وكيل المالية والمشتريات";
  return "الوكيل التنفيذي والإداري";
}

function buildResult(command: string, agentId: string) {
  const agent = agentName(agentId);
  const isFinance = /مالي|محاسبة|فاتورة|قيد|اعتماد|ميزانية|مصروف|شراء|مورد/.test(command);
  const isAdmin = /إدارة|ادارة|موظف|موظفين|هيكل|صلاحيات|سياسات|تشغيل الشركة/.test(command);
  const title = isFinance ? "تقرير مالي وإداري تنفيذي" : isAdmin ? "نظام إداري وتشغيلي مقترح" : "نتيجة تنفيذ الطلب";
  const content = `# ${title}

المنفذ: ${agent}

الطلب: ${command}

## 1. القرار التنفيذي
تم تحويل الطلب إلى مسار عمل رسمي داخل الشركة، مع تحديد المسؤول، المخرجات، والموافقة المطلوبة.

## 2. التسلسل الهرمي المعتمد
- المدير التنفيذي: يعتمد التوجهات والقرارات الكبرى.
- وكيل التشغيل والجودة: يتولى التشغيل، الجودة، المخزون، الإنتاج، والتقارير التشغيلية.
- وكيل المبيعات: يتولى العملاء، العروض، التحصيل، وخطة التوزيع.
- وكيل المالية والمشتريات: يتولى الميزانية، المصروفات، الموردين، أوامر الشراء، والاعتمادات.
- الوكيل التنفيذي والإداري: يتولى السياسات، الموظفين، الهيكل، المتابعة، وسجل القرارات.

## 3. الناتج المطلوب تنفيذه
- تحويل الطلب إلى مهام أسبوعية واضحة.
- تحديد صاحب كل مهمة والموعد المتوقع.
- ربط أي مصروف أو شراء بموافقة مالية.
- ربط أي قرار إداري بسجل نشاط وموافقة تنفيذية.
- إصدار تقرير متابعة يومي حتى الإغلاق.

## 4. الخطة الإدارية
1. اعتماد الهيكل الإداري والصلاحيات.
2. إنشاء سجل قرارات يومي.
3. إنشاء جدول متابعة لكل قسم.
4. تصعيد العوائق تلقائيًا للمدير التنفيذي.
5. إغلاق المهمة فقط بعد وجود نتيجة موثقة.

## 5. الخطة المالية
1. تصنيف كل طلب مالي إلى: مصروف، مشتريات، تحصيل، التزام، أو تقرير.
2. أي مصروف يحتاج موافقة وكيل المالية قبل التنفيذ.
3. إنشاء تقرير أسبوعي يحتوي الإيرادات، المصروفات، الالتزامات، والتحصيل.
4. منع تنفيذ أي شراء بدون مورد، سعر، سبب، واعتماد.
5. ربط كل طلب مالي بسجل audit واضح.

## 6. المخرجات المسلمة
- تم إنشاء مهمة تنفيذية.
- تم إنشاء تقرير متابعة.
- تم تسجيل النتيجة في سجل الوارد.
- تم إنشاء موافقة/تنبيه حسب نوع الطلب.

## 7. الخطوة التالية
راجع سجل الوارد، ثم حوّل البنود المطلوبة إلى تنفيذ فعلي أو اعتمد الخطة من لوحة الموافقات.`;
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
