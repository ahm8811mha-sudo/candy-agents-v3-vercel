import { getSupabaseAdmin, probeSupabaseConnection, type SupabaseConnectionStatus } from "../supabase";
import {
  getProductionReadiness,
  type ProductionReadiness,
  type ReadinessCheck,
} from "./productionReadiness";

const VALID_CAPABILITY_STATES = new Set([
  "LIVE",
  "SANDBOX",
  "HUMAN_CHECKPOINT",
  "NOT_INTEGRATED",
  "DISABLED",
]);

function replaceCheck(
  readiness: ProductionReadiness,
  id: string,
  passed: boolean,
  detail: string
) {
  readiness.checks = readiness.checks.map((item): ReadinessCheck =>
    item.id === id
      ? { ...item, severity: passed ? "PASS" : item.requiredForProduction ? "FAIL" : "WARN", detail }
      : item
  );
}

function recent(value: unknown, maximumHours: number) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) && timestamp >= Date.now() - maximumHours * 60 * 60_000;
}

export async function getEvidenceAwareProductionReadiness(): Promise<ProductionReadiness> {
  const readiness = getProductionReadiness();
  const connection = await probeSupabaseConnection();
  if (!connection.ready) {
    const details: Record<Exclude<SupabaseConnectionStatus, "READY">, string> = {
      NOT_CONFIGURED: "الحفظ على الخادم عبر Supabase غير مهيأ لهذا النشر.",
      PROJECT_MISMATCH: "رابط Supabase ومفتاح الخادم من مشروعين مختلفين، فتبقى الكتابة من الخادم موقوفة.",
      AUTH_REJECTED: "رفض Supabase مفتاح الخادم المضبوط. استبدل SUPABASE_SECRET_KEY بمفتاح Secret صالح للمشروع المرتبط.",
      SCHEMA_UNAVAILABLE: "قُبل مفتاح خادم Supabase، لكن فحص المخطط المعتمد غير متاح.",
      UNAVAILABLE: "تعذّر الوصول إلى Supabase، فتُركت استعلامات الأدلة لتجنب تكرار طلبات فاشلة.",
    };
    replaceCheck(readiness, "supabase-service-role", false, details[connection.status]);
    readiness.okForProduction = readiness.checks.every((item) => item.severity !== "FAIL");
    return readiness;
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return readiness;
  const tenantId = process.env.ORVANTA_TENANT_ID?.trim() || "golden-star";
  const evidenceEnvironment = readiness.mode === "production" ? "production" : "development";

  const [evidenceResult, cronResult, capabilityResult, receiptResult, backupResult, companyBrainResult, coreProbes] = await Promise.all([
    supabase.from("readiness_evidence").select("*").eq("environment", evidenceEnvironment).order("performed_at", { ascending: false }).limit(200),
    supabase.from("cron_runs").select("job_name,status,completed_at,started_at").eq("tenant_id", tenantId).in("job_name", ["system-watchdog", "failed-write-recovery"]).order("started_at", { ascending: false }).limit(20),
    supabase.from("capability_registry").select("capability_key,status,evidence_required,integration"),
    supabase.from("external_receipts").select("integration,operation,verified,verified_at,created_at").eq("verified", true).order("created_at", { ascending: false }).limit(500),
    supabase.from("backup_verification_runs").select("status,completed_at,started_at,backup_reference,restore_target").order("started_at", { ascending: false }).limit(10),
    supabase.from("company_ingestion_runs").select("id,status,completed_at,started_at,failures").eq("tenant_id", tenantId).eq("pipeline", "operational-to-company-brain-v1").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    Promise.all([
      supabase.from("workflow_instances").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("workflow_steps").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("event_outbox").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("execution_reconciliations").select("id").eq("tenant_id", tenantId).limit(1),
      supabase.from("accounting_periods").select("id").eq("tenant_id", tenantId).limit(1),
    ]),
  ]);

  const evidence = new Map<string, Record<string, unknown>>();
  if (!evidenceResult.error) {
    for (const row of (evidenceResult.data || []) as Record<string, unknown>[]) {
      const key = String(row.evidence_key || "");
      const details = row.details && typeof row.details === "object" ? row.details as Record<string, unknown> : {};
      if (key === "company-brain-cycle" && details.tenantId !== tenantId) continue;
      if (key && !evidence.has(key)) evidence.set(key, row);
    }
  }

  const passingEvidence = (key: string) => {
    const row = evidence.get(key);
    if (!row || row.status !== "PASS") return false;
    const expiresAt = row.expires_at ? Date.parse(String(row.expires_at)) : Number.POSITIVE_INFINITY;
    return !Number.isFinite(expiresAt) || expiresAt > Date.now();
  };

  replaceCheck(
    readiness,
    "core-schema-ready",
    coreProbes.every((probe) => !probe.error),
    coreProbes.every((probe) => !probe.error)
      ? "جداول سير العمل والصندوق الصادر والتسوية والمحاسبة ضمن حدود المستأجر متاحة لدور الخادم."
      : "جدول أو أكثر من جداول نظام الشركة المطلوبة غير متاح؛ طبّق سلسلة الهجرات المرتبة."
  );
  replaceCheck(
    readiness,
    "migration-baseline",
    passingEvidence("migration-chain-applied"),
    passingEvidence("migration-chain-applied")
      ? "سلسلة الهجرات المرتبة مسجلة مطبّقة ومتحققاً منها."
      : "لا دليل حالياً على سلسلة الهجرات."
  );
  replaceCheck(
    readiness,
    "execution-transaction",
    passingEvidence("execution-transaction-smoke"),
    passingEvidence("execution-transaction-smoke")
      ? "نجحت دالة التنفيذ المعتمدة في فحوص الذرية القابلة للتراجع وعدم التكرار وسير العمل والتدقيق والصندوق الصادر."
      : "لا دليل حالياً من فحص حزمة التنفيذ."
  );
  replaceCheck(
    readiness,
    "rls-regression-tested",
    passingEvidence("rls-regression"),
    passingEvidence("rls-regression")
      ? "نجحت فحوص انحدار RLS المسجلة، وما زالت ضمن مدة صلاحية دليلها."
      : "لا دليل ناجح حالياً على انحدار RLS."
  );
  replaceCheck(
    readiness,
    "tenant-rls-ready",
    Boolean(tenantId) && passingEvidence("rls-regression"),
    Boolean(tenantId) && passingEvidence("rls-regression")
      ? `المستأجر ${tenantId} صريح، ودليل انحدار RLS الحالي ناجح.`
      : "يلزم مستأجر صريح ودليل حالي على انحدار RLS."
  );
  replaceCheck(
    readiness,
    "accounting-controls",
    passingEvidence("accounting-controls-smoke"),
    passingEvidence("accounting-controls-smoke")
      ? "تُحقِّق من توازن الترحيل وثبات القيود المرحّلة والعكس في معاملة فحص تُلغى بعدها."
      : "دليل فحص ضوابط المحاسبة غير موجود أو منتهٍ."
  );
  replaceCheck(
    readiness,
    "browser-e2e",
    passingEvidence("browser-e2e"),
    passingEvidence("browser-e2e")
      ? "رحلات Chromium على سطح المكتب وWebKit على iPhone مسجلة ناجحة."
      : "لم يُسجَّل بعد دليل اختبار التصفح من تشغيل ناجح على main."
  );

  const companyBrain = companyBrainResult.error ? null : companyBrainResult.data;
  const companyBrainPassed = Boolean(
    companyBrain &&
    companyBrain.status === "SUCCEEDED" &&
    Number(companyBrain.failures || 0) === 0 &&
    recent(companyBrain.completed_at || companyBrain.started_at, 36) &&
    passingEvidence("company-brain-cycle")
  );
  replaceCheck(
    readiness,
    "company-brain-cycle",
    companyBrainPassed,
    companyBrainPassed
      ? `أتمّ المستأجر ${tenantId} دورة ناجحة كاملة للعقل المؤسسي خلال آخر 36 ساعة.`
      : `لا دورة حديثة ناجحة كاملة للعقل المؤسسي للمستأجر ${tenantId} بدليل PASS مطابق.`
  );

  const cronRows = cronResult.error ? [] : cronResult.data || [];
  const latestJob = (jobName: string) => cronRows.find((row) => row.job_name === jobName);
  const watchdog = latestJob("system-watchdog");
  const recovery = latestJob("failed-write-recovery");
  const watchdogPassed = Boolean(watchdog && watchdog.status === "SUCCEEDED" && recent(watchdog.completed_at || watchdog.started_at, 36));
  const recoveryPassed = Boolean(recovery && recovery.status === "SUCCEEDED" && recent(recovery.completed_at || recovery.started_at, 36));

  replaceCheck(
    readiness,
    "watchdog",
    watchdogPassed,
    watchdogPassed
      ? "أتمّ مراقب الإنتاج دورة ناجحة خلال آخر 36 ساعة."
      : "لم يُتمّ المراقب دورة ناجحة خلال آخر 36 ساعة."
  );
  replaceCheck(
    readiness,
    "failed-write-recovery",
    recoveryPassed,
    recoveryPassed
      ? "أتمّ عامل استعادة الكتابات الفاشلة تشغيلاً ناجحاً خلال آخر 36 ساعة."
      : "لم يُتمّ عامل استعادة الكتابات الفاشلة تشغيلاً ناجحاً خلال آخر 36 ساعة."
  );

  const capabilities = capabilityResult.error ? [] : capabilityResult.data || [];
  const receipts = receiptResult.error ? [] : receiptResult.data || [];
  const hasRecentReceipt = (integration: unknown) => receipts.some(
    (row) =>
      String(row.integration || "").toUpperCase() === String(integration || "").toUpperCase() &&
      row.verified === true &&
      recent(row.verified_at || row.created_at, 90 * 24)
  );
  const capabilityHasEvidence = (row: Record<string, unknown>) => {
    if (String(row.status) !== "LIVE" || row.evidence_required !== true) return true;
    const capabilityKey = String(row.capability_key || "");
    if (capabilityKey === "finance.journal.post") return passingEvidence("accounting-controls-smoke");
    return hasRecentReceipt(row.integration) || passingEvidence(`capability:${capabilityKey}`);
  };
  const invalidCapabilities = (capabilities as Record<string, unknown>[]).filter(
    (row) => !VALID_CAPABILITY_STATES.has(String(row.status)) || !capabilityHasEvidence(row)
  );
  const capabilityPassed = capabilities.length > 0 && invalidCapabilities.length === 0;
  replaceCheck(
    readiness,
    "capability-registry",
    capabilityPassed,
    capabilityPassed
      ? `${capabilities.length} قدرة مصنفة صراحة، ولكل قدرة LIVE تتطلب دليلاً إيصال متحقق منه حالي أو سجل فحص.`
      : invalidCapabilities.length
        ? `دليل القدرة ناقص أو غير صالح لـ: ${invalidCapabilities.map((row) => String(row.capability_key)).join(", ")}.`
        : "سجل القدرات فارغ أو غير متاح."
  );

  const backups = backupResult.error ? [] : backupResult.data || [];
  const verifiedBackup = backups.find((row) => row.status === "SUCCEEDED" && recent(row.completed_at || row.started_at, 90 * 24));
  replaceCheck(
    readiness,
    "backup-restore",
    Boolean(verifiedBackup),
    verifiedBackup
      ? `تمرين استعادة ناجح مسجل إلى ${verifiedBackup.restore_target || "هدف معزول"}.`
      : "لا تمرين استعادة ناجحاً مسجلاً خلال آخر 90 يوماً."
  );

  readiness.okForProduction = readiness.checks.every((item) => item.severity !== "FAIL");
  return readiness;
}
