export function commandStatusLabel(status: string) {
  if (status === "CLOSED") return "مغلق";
  if (status === "BLOCKED") return "متوقف";
  if (status === "AWAITING_CHAIRMAN") return "بانتظار الاعتماد";
  if (status === "IN_SPEND_CHAIN") return "في سلسلة الصرف";
  return "قيد العمل";
}
