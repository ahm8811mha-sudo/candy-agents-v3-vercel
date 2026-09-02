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

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
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

export async function GET() {
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

    const [projectsResult, tasksResult] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }).limit(40),
      supabase
        .from("tasks")
        .select("id,project_id,title,description,content,status,priority,owner_role,due_date,progress_percent,created_at,metadata")
        .is("archived_at", null)
        .order("created_at", { ascending: true })
        .limit(400),
    ]);
    if (projectsResult.error) throw projectsResult.error;
    if (tasksResult.error) throw tasksResult.error;

    const tasks = (tasksResult.data || []) as TaskRow[];
    const today = new Date().toISOString().slice(0, 10);

    const projects = (projectsResult.data || []).map((project: Record<string, unknown>) => {
      const projectTasks = tasks.filter((task) => task.project_id === project.id);
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
