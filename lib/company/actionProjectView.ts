export type ProjectActionView = { id: string; project_id?: string | null; status: string };
export type ProjectTaskView = { id: string; project_id?: string | null; status: string; progress_percent?: number | null };
export type ProjectView = { id: string; status?: string | null; approval_status?: string | null };

export type ProjectExecutionGroup<P extends ProjectView, A extends ProjectActionView, T extends ProjectTaskView> = {
  project: P;
  actions: A[];
  tasks: T[];
  progress: number;
  doneActions: number;
  failedActions: number;
  doneTasks: number;
};

const activeProjectStatuses = new Set(["ACTIVE", "RUNNING", "RESULTS_READY", "EXECUTION_ATTENTION", "COMPLETED"]);

export function isApprovedProject(project: ProjectView) {
  const approval = String(project.approval_status || "").toUpperCase();
  if (approval === "REJECTED") return false;
  return approval === "APPROVED"
    || activeProjectStatuses.has(String(project.status || "").toUpperCase());
}

export function isPendingProject(project: ProjectView) {
  return String(project.approval_status || "").toUpperCase() === "PENDING"
    || String(project.status || "").toUpperCase() === "PENDING_APPROVAL";
}

export function buildActionProjectGroups<
  P extends ProjectView,
  A extends ProjectActionView,
  T extends ProjectTaskView,
>(projects: P[], actions: A[], tasks: T[]) {
  const knownIds = new Set(projects.map((project) => project.id));
  const makeGroup = (project: P): ProjectExecutionGroup<P, A, T> => {
    const projectActions = actions.filter((action) => action.project_id === project.id);
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const doneActions = projectActions.filter((action) => action.status === "DONE").length;
    const failedActions = projectActions.filter((action) => action.status === "FAILED").length;
    const doneTasks = projectTasks.filter((task) => task.status === "DONE").length;
    const taskProgress = projectTasks.length
      ? Math.round(projectTasks.reduce((sum, task) => sum + Number(task.progress_percent || (task.status === "DONE" ? 100 : 0)), 0) / projectTasks.length)
      : 0;
    const progress = projectActions.length ? Math.round((doneActions / projectActions.length) * 100) : taskProgress;
    return { project, actions: projectActions, tasks: projectTasks, progress, doneActions, failedActions, doneTasks };
  };

  const groups = projects.map(makeGroup);
  return {
    approved: groups.filter((group) => isApprovedProject(group.project)),
    pending: groups.filter((group) => !isApprovedProject(group.project) && isPendingProject(group.project)),
    inactive: groups.filter((group) => !isApprovedProject(group.project) && !isPendingProject(group.project)),
    unassigned: actions.filter((action) => !action.project_id || !knownIds.has(action.project_id)),
  };
}
