import { calculateFinancials, type Financials } from "./accountingSystem";
import { getSupabaseAdmin } from "./supabase";

type ExecutionProject = {
  id: string;
  name: string;
  status?: string;
  created_at?: string;
};

type ExecutionTask = {
  id: string;
  project_id: string;
  title: string;
  content: string;
  status: string;
  created_at?: string;
};

type CompanyExecutionResult = {
  financials: Financials;
  cfo: string;
  ceo: string;
  tasks: string;
  project: ExecutionProject;
  task: ExecutionTask;
  saved: boolean;
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function runAI(prompt: string, fallback: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content:
            "You are a professional business AI operating as an enterprise company. Write in Arabic with structured, realistic execution outputs.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!res.ok) return fallback;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || fallback;
}

function fallbackCfo(request: string, financials: Financials) {
  const recommendation =
    financials.profit > 0
      ? "موافقة مشروطة بمرحلة تجريبية وربط الصرف بعائد قابل للقياس."
      : "رفض مؤقت أو تقليل النطاق حتى تتحسن السيولة.";

  return `
## تقرير CFO

### اعتماد الميزانية
${recommendation}

### الأثر المالي
- الإيرادات: ${financials.income.toLocaleString("ar-SA")} ريال
- المصروفات: ${financials.expenses.toLocaleString("ar-SA")} ريال
- صافي الربح: ${financials.profit.toLocaleString("ar-SA")} ريال

### المخاطر
- الالتزام بميزانية كبيرة قبل إثبات الطلب.
- ضعف قياس العائد إذا لم توجد مؤشرات أسبوعية.
- ضغط السيولة إذا تم الصرف دفعة واحدة.

### القرار المالي
الطلب: ${request}
ينفذ فقط عبر مراحل واضحة، مع سقف صرف أولي ومراجعة مالية قبل الانتقال للمرحلة التالية.
`.trim();
}

function fallbackCeo(cfo: string) {
  return `
## قرار CEO

### القرار النهائي
اعتماد التنفيذ بشكل معدل ومشروط.

### سبب القرار
تقرير المدير المالي يوضح أن التنفيذ ممكن إذا تم التحكم في الصرف وتقسيم المخاطر.

### خطة التنفيذ
- إنشاء مشروع تنفيذي رسمي.
- تحويل القرار إلى مهام قابلة للمتابعة.
- مراجعة الأداء خلال 14 يوم عمل.
- إيقاف أو توسيع المشروع بناء على الربحية ومؤشرات التشغيل.

### مرجع CFO
${cfo}
`.trim();
}

function fallbackTasks(decision: string) {
  return `
## قائمة المهام التنفيذية

1. إعداد نطاق المشروع
- المسؤول: مدير العمليات
- المدة: يومان

2. اعتماد الميزانية المرحلية
- المسؤول: المدير المالي
- المدة: يوم عمل

3. تجهيز خطة التسويق الأولية
- المسؤول: مدير التسويق
- المدة: 3 أيام

4. تجهيز الموارد والموردين
- المسؤول: سلسلة الإمداد
- المدة: 5 أيام

5. مراجعة النتائج وإصدار قرار التوسع
- المسؤول: الرئيس التنفيذي
- المدة: بعد 14 يوم عمل

## القرار الذي تم تحويله
${decision}
`.trim();
}

async function CFO(request: string, financials: Financials) {
  return runAI(
    `
You are a CFO.

Financials:
${JSON.stringify(financials, null, 2)}

Request:
${request}

Give:
- Budget approval
- Financial impact
- Risks
- Decision

Rules:
- Be realistic.
- Use corporate finance logic.
- Write in Arabic.
`,
    fallbackCfo(request, financials)
  );
}

async function CEO(cfo: string) {
  return runAI(
    `
You are a CEO.

CFO Report:
${cfo}

Give final decision and execution plan.

Rules:
- Make one clear executive decision.
- Convert the decision into a practical business direction.
- Write in Arabic.
`,
    fallbackCeo(cfo)
  );
}

async function generateTasks(decision: string) {
  return runAI(
    `
Convert this decision into tasks:

${decision}

Return:
- Tasks list
- Required roles
- Timeline

Rules:
- Write practical execution tasks.
- Each task must include owner role and deadline.
- Write in Arabic.
`,
    fallbackTasks(decision)
  );
}

async function createProjectFlow(request: string, tasks: string) {
  const projectName = request.trim().slice(0, 120);
  const taskTitle = `تنفيذ قرار: ${projectName.slice(0, 70)}`;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    const project = {
      id: newId("project"),
      name: projectName,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
    };
    return {
      project,
      task: {
        id: newId("execution-task"),
        project_id: project.id,
        title: taskTitle,
        content: tasks,
        status: "TODO",
        created_at: new Date().toISOString(),
      },
      saved: false,
    };
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      name: projectName,
      request: request.trim(),
      status: "ACTIVE",
    })
    .select("id,name,status,created_at")
    .single();

  if (projectError) throw projectError;

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      id: newId("execution-task"),
      project_id: project.id,
      title: taskTitle,
      description: tasks,
      content: tasks,
      status: "TODO",
      priority: "HIGH",
      progress_percent: 0,
      due_date: new Date(Date.now() + 14 * 86400000).toISOString(),
    })
    .select("id,project_id,title,content,status,created_at")
    .single();

  if (taskError) throw taskError;

  return {
    project: project as ExecutionProject,
    task: task as ExecutionTask,
    saved: true,
  };
}

async function saveFinancialDecision(request: string, financials: Financials, cfo: string, ceo: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("financial_decisions").insert({
    request,
    financials,
    cfo_report: cfo,
    ceo_decision: ceo,
  });

  if (error) throw error;
  return true;
}

export async function runCompanyExecution(request: string): Promise<CompanyExecutionResult> {
  if (!request?.trim()) {
    throw new Error("نص الطلب مطلوب.");
  }

  const financials = await calculateFinancials();
  const cfo = await CFO(request.trim(), financials);
  const ceo = await CEO(cfo);
  await saveFinancialDecision(request.trim(), financials, cfo, ceo);
  const tasks = await generateTasks(ceo);
  const { project, task, saved } = await createProjectFlow(request.trim(), tasks);

  return {
    financials,
    cfo,
    ceo,
    tasks,
    project,
    task,
    saved,
  };
}

export async function getDashboardData() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      projects: [],
      tasks: [],
      decisions: [],
    };
  }

  const [projects, tasks, decisions] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(20),
    supabase
      .from("tasks")
      .select("id,project_id,title,content,status,priority,created_at,due_date,progress_percent")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("financial_decisions").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  if (projects.error) throw projects.error;
  if (tasks.error) throw tasks.error;
  if (decisions.error) throw decisions.error;

  return {
    projects: projects.data || [],
    tasks: tasks.data || [],
    decisions: decisions.data || [],
  };
}
