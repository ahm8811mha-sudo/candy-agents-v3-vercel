export type WorkStatus = "NEW" | "PLANNED" | "WAITING_OWNER" | "IN_PROGRESS" | "DONE" | "BLOCKED";

export type WorkItem = {
  id: string;
  title: string;
  status: WorkStatus;
  createdAt: string;
  updatedAt: string;
};
