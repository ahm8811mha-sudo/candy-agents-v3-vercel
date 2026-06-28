import { getSupabaseAdmin } from "./supabase";

export type MemoryEntry = {
  id?: string;
  event_type: string;
  title: string;
  summary: string;
  decision_quality: "SUCCESS" | "PROMISING" | "WATCH" | "FAILED";
  lessons_learned?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

export type DecisionPattern = {
  pattern: string;
  successRate: number;
  totalDecisions: number;
  avgHealthScore: number;
  recommendation: string;
};

export async function storeMemory(entry: Omit<MemoryEntry, "id" | "created_at">): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const { error } = await supabase.from("business_memory").insert({
    event_type: entry.event_type,
    title: entry.title,
    summary: entry.summary,
    decision_quality: entry.decision_quality,
    lessons_learned: entry.lessons_learned || "",
    metadata: entry.metadata || {},
  });

  return !error;
}

export async function getRecentMemories(limit: number = 20): Promise<MemoryEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("business_memory")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []) as MemoryEntry[];
}

export async function searchMemories(query: string): Promise<MemoryEntry[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("business_memory")
    .select("*")
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) return [];
  return (data || []) as MemoryEntry[];
}

export async function analyzeDecisionPatterns(): Promise<DecisionPattern[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return getDefaultPatterns();

  const { data, error } = await supabase
    .from("business_memory")
    .select("event_type, decision_quality, metadata")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data?.length) return getDefaultPatterns();

  const typeGroups = new Map<string, { success: number; total: number; healthScores: number[] }>();

  for (const row of data) {
    const type = row.event_type || "UNKNOWN";
    const group = typeGroups.get(type) || { success: 0, total: 0, healthScores: [] };
    group.total++;
    if (row.decision_quality === "SUCCESS" || row.decision_quality === "PROMISING") {
      group.success++;
    }
    const hs = (row.metadata as Record<string, unknown>)?.healthScore;
    if (typeof hs === "number") group.healthScores.push(hs);
    typeGroups.set(type, group);
  }

  const patterns: DecisionPattern[] = [];
  for (const [type, group] of typeGroups) {
    const successRate = group.total > 0 ? group.success / group.total : 0;
    const avgHealth = group.healthScores.length > 0
      ? group.healthScores.reduce((a, b) => a + b, 0) / group.healthScores.length
      : 50;

    patterns.push({
      pattern: type,
      successRate: Math.round(successRate * 100),
      totalDecisions: group.total,
      avgHealthScore: Math.round(avgHealth),
      recommendation: successRate >= 0.7
        ? "نمط ناجح - يُنصح بالاستمرار بنفس المنهج"
        : successRate >= 0.4
          ? "نمط متوسط - يحتاج مراجعة وتعديل"
          : "نمط ضعيف - يُنصح بتغيير الاستراتيجية",
    });
  }

  return patterns.length > 0 ? patterns : getDefaultPatterns();
}

export async function getMemoryContext(request: string): Promise<string> {
  const memories = await searchMemories(request);
  if (!memories.length) return "";

  const relevantMemories = memories.slice(0, 5);
  const lines = relevantMemories.map((m) =>
    `- [${m.decision_quality}] ${m.title}: ${m.summary.slice(0, 200)}`
  );

  return `\n\nقرارات سابقة مشابهة:\n${lines.join("\n")}`;
}

function getDefaultPatterns(): DecisionPattern[] {
  return [
    {
      pattern: "COMPANY_EXECUTION",
      successRate: 65,
      totalDecisions: 0,
      avgHealthScore: 55,
      recommendation: "لا توجد بيانات كافية بعد - استمر في التتبع",
    },
  ];
}
