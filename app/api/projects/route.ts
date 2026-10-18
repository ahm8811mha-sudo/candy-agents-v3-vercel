/**
 * Projects with their tasks, summarised honestly.
 *
 * The dashboard endpoint returns projects and tasks as two flat lists without
 * metadata, so nothing downstream could tell an internal deliverable from a
 * real-world step — which is exactly the difference that decides whether a
 * project is genuinely finished. This route joins the two, carries the metadata
 * the honesty rules depend on, and does the counting server-side so the number
 * on the screen is the number the rules produce.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireCompanyContext } from "@/lib/company-os/context";
import { logError } from "@/lib/logger";
import {
  isRealWorldTask,
  summarizeExecutionHonesty,
  taskExecutionState,
  type HonestyTask,
} from "@/lib/company/executionHonesty";

type TaskRow = HonestyTask & {
  id: string;
  project_id: string | null;
  title: string;
  description?: string | null;
  content?: string | null;
  priority?: string | null;
  owner_role?: string | null;
  due_date?: string | null;
  created_at?: string | null;
};

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCompanyContext(req);
  if (!auth.ok) return auth.response;
  const tenantId = auth.context.tenantId;
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({
        ok: true,
        configured: false,
        projects: [],
        message: "قاعدة البيانات غير مهيأة على هذا النشر، فلا توجد مشاريع محفوظة لعرضها.",
      });
    }

    const projectRows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 250) {
      const { data, error } = await supabase.from("projects").select("*").eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }).order("id").range(offset, offset + 249);
      if (error) throw error;
      projectRows.push(...(data || []));
      if (!data || data.length < 250) break;
    }
    const tasks: TaskRow[] = [];
    for (let batch = 0; batch < projectRows.length; batch += 100) {
      const ids = projectRows.slice(batch, batch + 100).map((project) => String(project.id));
      for (let offset = 0; ; offset += 250) {
        const { data, error } = await supabase.from("tasks")
          .select("id,project_id,title,description,content,status,priority,owner_role,due_date,progress_percent,created_at,metadata")
          .eq("tenant_id", tenantId).in("project_id", ids).order("created_at").order("id").range(offset, offset + 249);
        if (error) throw error;
        tasks.push(...((data || []) as TaskRow[]));
        if (!data || data.length < 250) break;
      }
    }
    const tasksByProject = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      if (!task.project_id) continue;
      const group = tasksByProject.get(task.project_id) || [];
      group.push(task); tasksByProject.set(task.project_id, group);
    }
    const today = new Date().toISOString().slice(0, 10);

    const projects = projectRows.map((project: Record<string, unknown>) => {
      const projectTasks = tasksByProject.get(String(project.id)) || [];
      const summary = summarizeExecutionHonesty(projectTasks);
      const shaped = projectTasks.map((task) => ({
        id: task.id,
        title: task.title,
        detail: String(task.description || task.content || "").trim(),
        status: task.status,
        priority: task.priority || null,
        ownerRole: task.owner_role || null,
        dueDate: task.due_date || null,
        overdue: Boolean(task.due_date && String(task.due_date).slice(0, 10) < today && taskExecutionState(task) !== "REAL_DONE" && taskExecutionState(task) !== "INTERNAL_DONE"),
        progress: Number(task.progress_percent || 0),
        executionKind: isRealWorldTask(task) ? "REAL_WORLD" : "INTERNAL",
        state: taskExecutionState(task),
      }));
      return {
        id: String(project.id),
        name: String(project.name || "مشروع بلا اسم"),
        status: String(project.status || "ACTIVE"),
        projectNumber: (project.project_number as number | null) ?? null,
        createdAt: (project.created_at as string | null) ?? null,
        budgetSAR: Number(project.budget || project.budget_sar || 0) || null,
        summary,
        overdueCount: shaped.filter((task) => task.overdue).length,
        tasks: shaped,
      };
    });

    return NextResponse.json({ ok: true, configured: true, projects });
  } catch (error) {
    await logError("PROJECTS_LIST_FAILED", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "تعذر تحميل المشاريع." },
      { status: 500 }
    );
  }
}
