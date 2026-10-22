import { getSupabaseEnvironmentReadiness, hasSupabaseEnv } from "../supabase";
import { isAuthEnabled, isPersonalOwnerMode } from "../auth";
import { isOwnerAccessConfigured, hasDedicatedCookieSecret } from "../security/personalAccess";
import { getGoogleWorkspaceStatus } from "../integrations/googleWorkspace";
import { outboxConfiguration } from "../company-os/outboxConfiguration";

export type ReadinessSeverity = "PASS" | "WARN" | "FAIL";

export type ReadinessCheck = {
  id: string;
  label: string;
  severity: ReadinessSeverity;
  detail: string;
  requiredForProduction: boolean;
};

export type ProductionReadiness = {
  okForProduction: boolean;
  mode: "production" | "development" | "test";
  accessMode: "personal" | "commercial";
  checks: ReadinessCheck[];
};

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  requiredForProduction = true
): ReadinessCheck {
  return {
    id,
    label,
    severity: passed ? "PASS" : requiredForProduction ? "FAIL" : "WARN",
    detail,
    requiredForProduction,
  };
}

function enabled(name: string) {
  return process.env[name] === "true";
}

export function getProductionReadiness(): ProductionReadiness {
  const mode = process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development";
  const personalMode = isPersonalOwnerMode();
  const supabaseEnvironment = getSupabaseEnvironmentReadiness();
  const hasServerSecret = supabaseEnvironment.hasServerKey;
  const hasPublicAnonServerWriteFallback = Boolean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const personalAccessCode = process.env.ORVANTA_OWNER_ACCESS_KEY || process.env.API_SECRET_KEY || "";
  const personalAccessCodeConfigured = Boolean(personalAccessCode);
  // Strength is judged on the CONFIGURED code, not on what the login form
  // accepts. This is the only place a length rule protects anything: it warns
  // the owner that the key guarding the whole system is weak, without ever
  // blocking them from signing in with the key they actually have.
  const OWNER_CODE_MIN_LENGTH = 12;
  const ownerCodeStrong = personalAccessCode.length >= OWNER_CODE_MIN_LENGTH;
  const googleWorkspace = getGoogleWorkspaceStatus();
  const outbox = outboxConfiguration();
  const workflowRuntimeEnabled = personalMode
    ? process.env.ORVANTA_WORKFLOW_RUNTIME_ENABLED !== "false"
    : enabled("ORVANTA_WORKFLOW_RUNTIME_ENABLED");
  const reconciliationRequired = process.env.ORVANTA_RECONCILIATION_REQUIRED !== "false";
  const googleWorkspaceCheck = googleWorkspace.enabled
    ? check(
        "google-workspace",
        "Google Workspace execution",
        googleWorkspace.credentialsConfigured,
        googleWorkspace.credentialsConfigured
          ? "Google Workspace مفعّل وبيانات OAuth مضبوطة. ويبقى كل تنفيذ خارجي مسجلاً بمحاولة تكامل وإيصال."
          : `Google Workspace مفعّل وتنقصه: ${googleWorkspace.missingEnvironmentVariables.join(", ")}`,
        true
      )
    : check(
        "google-workspace",
        "Google Workspace execution",
        false,
        "تنفيذ Google Workspace متوقف. تنبيه لا يوقف النواة الشخصية، ولا يُعرض على أنه يعمل.",
        false
      );

  const tenantIsolationPassed = personalMode
    ? Boolean(process.env.ORVANTA_TENANT_ID) && enabled("ORVANTA_RLS_READY")
    : enabled("ORVANTA_MULTI_TENANT") && enabled("ORVANTA_RLS_READY");

  const checks: ReadinessCheck[] = [
    check(
      "access-gate",
      personalMode ? "Personal owner access gate" : "Production authentication gate",
      isAuthEnabled() && (!personalMode || personalAccessCodeConfigured),
      personalMode
        ? isOwnerAccessConfigured() && personalAccessCodeConfigured
          ? "الوضع الشخصي يتطلب رمز مالك على الخادم وملف ارتباط موقّعاً لجهاز موثوق، ولا دخول مجهول بصلاحية المالك."
          : "اضبط ORVANTA_OWNER_ACCESS_KEY وسر توقيع على الخادم قبل فتح مساحة العمل الشخصية."
        : isAuthEnabled()
          ? "المصادقة التجارية مفعّلة؛ المسارات الحساسة تتطلب دوراً موثقاً وسياق مستأجر."
          : "AUTH_ENABLED ليست true، فيجب أن تُغلق المسارات التجارية عند الشك."
    ),
    check(
      "owner-code-strength",
      "Owner access code strength",
      !personalMode || !personalAccessCodeConfigured || ownerCodeStrong,
      !personalAccessCodeConfigured
        ? "لم يُضبط رمز وصول للمالك بعد."
        : ownerCodeStrong
          ? `رمز المالك المضبوط لا يقل عن ${OWNER_CODE_MIN_LENGTH} حرفاً.`
          : `عدد أحرف رمز المالك المضبوط ${personalAccessCode.length} فقط، وهو يفتح النظام المالي والتشغيلي كله. استبدل ORVANTA_OWNER_ACCESS_KEY برمز لا يقل عن ${OWNER_CODE_MIN_LENGTH} حرفاً (يُنصح بعشرين فأكثر)، ثم أعد النشر.`,
      false
    ),
    check(
      "owner-cookie-secret",
      "Dedicated owner cookie signing secret",
      hasDedicatedCookieSecret(),
      hasDedicatedCookieSecret()
        ? "ORVANTA_OWNER_COOKIE_SECRET مضبوط: توقيع الجلسة مستقل عن مفتاح قاعدة البيانات."
        : "ملفات ارتباط المالك تُوقَّع احتياطياً بسر Supabase. اضبط ORVANTA_OWNER_COOKIE_SECRET مخصصاً، حتى لا يرتبط أمان الجلسة بمفتاح قاعدة البيانات ولا يتغير بتدويره."
    ),
    check(
      "basic-auth-disabled",
      "No production Basic Auth",
      process.env.NODE_ENV === "production" || process.env.ALLOW_BASIC_AUTH !== "true",
      process.env.ALLOW_BASIC_AUTH === "true"
        ? "ALLOW_BASIC_AUTH=true مقبولة في التطوير المحلي فقط، وتُتجاهل في الإنتاج."
        : "Basic Auth متوقف؛ يلزم وصول مالك موقّع أو جلسة Supabase أو بيانات نظام موثوقة."
    ),
    check(
      "supabase-service-role",
      "Durable server persistence",
      hasSupabaseEnv() && hasServerSecret,
      supabaseEnvironment.configurationIssue === "PROJECT_MISMATCH"
        ? "رابط Supabase ومفتاح الخادم من مشروعين مختلفين. استبدل مفتاح الخادم في Vercel بمفتاح من المشروع المضبوط؛ وتبقى الكتابة موقوفة حتى يتطابقا."
        : hasServerSecret
        ? `${supabaseEnvironment.keySource} مضبوط للكتابة من الخادم وحده.`
        : "SUPABASE_SECRET_KEY (أو SUPABASE_SERVICE_ROLE_KEY القديم) غير موجود، فلا تُحفظ المشاريع ولا الاعتمادات ولا التدقيق ولا الإجراءات ولا حالة سير العمل ولا الدفتر."
    ),
    check(
      "core-schema-ready",
      "Company OS core schema",
      enabled("ORVANTA_CORE_SCHEMA_READY"),
      enabled("ORVANTA_CORE_SCHEMA_READY")
        ? "تأكد تطبيق هجرة اكتمال النواة."
        : "طبّق هجرات Supabase المرتبة في بيئة الاختبار والإنتاج، ثم اضبط ORVANTA_CORE_SCHEMA_READY=true."
    ),
    check(
      "execution-transaction",
      "Atomic execution bundle",
      false,
      "لا دليل حالياً على حزمة تنفيذ قابلة للتراجع."
    ),
    check(
      "migration-baseline",
      "Ordered migration baseline",
      enabled("ORVANTA_MIGRATIONS_BASELINED"),
      enabled("ORVANTA_MIGRATIONS_BASELINED")
        ? "لمخطط الإنتاج خط أساس مرتب، وتحقُّق من الهجرات في بيئة الاختبار."
        : "أنشئ خط أساس الإنتاج من supabase/migrations وتحقق منه قبل إعلان الجاهزية."
    ),
    check(
      "tenant-rls-ready",
      personalMode ? "Single-tenant RLS boundary" : "Tenant claims and RLS",
      tenantIsolationPassed,
      tenantIsolationPassed
        ? personalMode
          ? "مساحة العمل الشخصية تستخدم مستأجراً واحداً صريحاً، وRLS باقٍ مفعّلاً."
          : "RLS بحدود المستأجر مؤكد، ويمكن تشغيل اختبارات العبور بين المستأجرين."
        : personalMode
          ? "اضبط ORVANTA_TENANT_ID وأكّد ORVANTA_RLS_READY=true؛ فالوضع الشخصي لا يبرر إيقاف RLS."
          : "اضبط tenant_id في app_metadata للجلسة، وفعّل ORVANTA_MULTI_TENANT، وطبّق سياسات RLS، ثم اضبط ORVANTA_RLS_READY=true."
    ),
    check(
      "rls-regression-tested",
      "RLS regression suite",
      enabled("ORVANTA_RLS_TESTED"),
      enabled("ORVANTA_RLS_TESTED")
        ? "اختبارات وصول المجهول والمالك والخدمة والعبور بين المستأجرين مسجلة ناجحة."
        : "شغّل supabase/tests/rls_regression.sql على بيئة الاختبار، ولا تضبط ORVANTA_RLS_TESTED=true إلا بعد حفظ الدليل."
    ),
    check(
      "workflow-runtime",
      "Durable workflow runtime",
      workflowRuntimeEnabled,
      workflowRuntimeEnabled
        ? "مسارات العمل الدائمة مفعّلة: خطواتها ومحاولاتها واعتماداتها واستعادتها بعد إعادة التشغيل."
        : "ORVANTA_WORKFLOW_RUNTIME_ENABLED ليست true، فتبقى مسارات العمل الطويلة موقوفة."
    ),
    check(
      "outbox-publisher",
      "Transactional outbox publisher",
      outbox.ready,
      outbox.ready
        ? "مصادقة مجدول الصندوق الصادر ووجهة HTTPS وسر التوقيع مضبوطة؛ وهذا لا يثبت التسليم."
        : `النشر من الصندوق الصادر موقوف. ناقص أو غير صالح: ${outbox.missing.join(", ")}. وتبقى الأحداث المعلقة في الطابور.`
    ),
    check(
      "watchdog",
      "Operational watchdog and cron tracking",
      enabled("ORVANTA_WATCHDOG_ENABLED"),
      enabled("ORVANTA_WATCHDOG_ENABLED")
        ? "كل المهام المجدولة تسجل تشغيلها، والمراقب مجدول."
        : "انشر مسارات المهام المجدولة المتتبَّعة، ثم اضبط ORVANTA_WATCHDOG_ENABLED=true بعد دورة ناجحة للمراقب."
    ),
    check(
      "failed-write-recovery",
      "Failed-write retry and dead letter worker",
      enabled("ORVANTA_FAILED_WRITE_WORKER_ENABLED"),
      enabled("ORVANTA_FAILED_WRITE_WORKER_ENABLED")
        ? "الكتابات الفاشلة تُستلم وتُعاد بمهلة متزايدة، وتنتقل إلى قائمة الإخفاق النهائي حين تنفد محاولاتها."
        : "فعّل عامل استعادة الكتابات الفاشلة بعد أول تشغيل ناجح له في الإنتاج فقط."
    ),
    check(
      "reconciliation-required",
      "External receipt and reconciliation",
      reconciliationRequired,
      reconciliationRequired
        ? "لا يكتمل إجراء خارجي دون دليل وتسوية."
        : "اضبط ORVANTA_RECONCILIATION_REQUIRED=true بعد تطبيق مخطط التسوية والإيصالات."
    ),
    check(
      "capability-registry",
      "Capability truth registry",
      enabled("ORVANTA_CAPABILITY_REGISTRY_READY"),
      enabled("ORVANTA_CAPABILITY_REGISTRY_READY")
        ? "كل قدرة معروضة موسومة: LIVE أو SANDBOX أو HUMAN_CHECKPOINT أو NOT_INTEGRATED أو DISABLED."
        : "تحقق من سجل القدرات وأخفِ الوحدات غير المدعومة قبل ضبط ORVANTA_CAPABILITY_REGISTRY_READY=true."
    ),
    check(
      "company-brain-cycle",
      "Company Brain production cycle",
      false,
      "لم يُتحقق بعد من دورة حديثة للعقل المؤسسي ضمن حدود المستأجر."
    ),
    check(
      "accounting-controls",
      "Immutable accounting and period close",
      enabled("ORVANTA_ACCOUNTING_CONTROLS_READY"),
      enabled("ORVANTA_ACCOUNTING_CONTROLS_READY")
        ? "القيود المرحّلة لا تُعدَّل، والعكس إلزامي، وعروض إغلاق الفترة والتقارير مفعّلة."
        : "طبّق ضوابط المحاسبة، واختبر العكس والإغلاق، ثم اضبط ORVANTA_ACCOUNTING_CONTROLS_READY=true."
    ),
    check(
      "browser-e2e",
      "Desktop and iPhone E2E gate",
      enabled("ORVANTA_E2E_VERIFIED"),
      enabled("ORVANTA_E2E_VERIFIED")
        ? "رحلات وصول المالك والقفل والتنقل وحالة النظام ناجحة في Chromium وفي محاكاة iPhone."
        : "يجب أن ينجح اختبار التصفح على main قبل ضبط ORVANTA_E2E_VERIFIED=true."
    ),
    check(
      "backup-restore",
      "Backup restore drill",
      enabled("ORVANTA_BACKUP_RESTORE_VERIFIED"),
      enabled("ORVANTA_BACKUP_RESTORE_VERIFIED")
        ? "تمرين استعادة حديث مسجل، ونجح التحقق من الجداول الأساسية."
        : "وجود نسخة احتياطية لا يكفي. أكمل تمرين استعادة وسجّله قبل ضبط ORVANTA_BACKUP_RESTORE_VERIFIED=true."
    ),
    check(
      "api-secret",
      "Internal API secret",
      Boolean(process.env.API_SECRET_KEY),
      process.env.API_SECRET_KEY
        ? "API_SECRET_KEY مضبوط لاستدعاءات النظام الموثوقة."
        : personalMode
          ? "API_SECRET_KEY اختياري في الوضع الشخصي؛ ملفات ارتباط المالك وCRON_SECRET تحمي الواجهات العاملة."
          : "API_SECRET_KEY غير موجود. أضفه قبل فتح نقاط الأتمتة الداخلية.",
      !personalMode
    ),
    check(
      "cron-secret",
      "Scheduler authentication",
      Boolean(process.env.CRON_SECRET),
      process.env.CRON_SECRET
        ? "CRON_SECRET مضبوط لعمال سير العمل والمراقبة والاستعادة والصندوق الصادر."
        : "CRON_SECRET غير موجود، فلا تُستدعى العمليات الخلفية بأمان."
    ),
    check(
      "openai-key",
      "LLM execution",
      Boolean(process.env.OPENAI_API_KEY),
      process.env.OPENAI_API_KEY
        ? "OPENAI_API_KEY مضبوط؛ يستطيع الوكلاء استخدام تقارير النماذج."
        : "OPENAI_API_KEY غير موجود؛ فيعود النظام إلى تقارير ثابتة القواعد.",
      false
    ),
    check(
      "public-anon-write-fallback-disabled",
      "No public anon server write fallback",
      !hasPublicAnonServerWriteFallback,
      hasPublicAnonServerWriteFallback
        ? "مفاتيح anon موجودة في البيئة؛ يتجاهلها الحفظ على الخادم، ولا تكتب أبداً في جداول الحوكمة أو المالية."
        : "لا كتابة احتياطية بمفتاح anon في الحفظ على الخادم.",
      false
    ),
    googleWorkspaceCheck,
  ];

  return {
    okForProduction: checks.every((item) => item.severity !== "FAIL"),
    mode,
    accessMode: personalMode ? "personal" : "commercial",
    checks,
  };
}
