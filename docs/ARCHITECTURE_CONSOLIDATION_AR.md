# توحيد المعمارية — الوحدة المرجعية لكل مسؤولية

آخر تحديث: 2026-07-14

القاعدة الحاكمة: **لكل مسؤولية وحدة مرجعية واحدة (Source of Truth). أي كود جديد
يستورد من الوحدة المرجعية، ولا يُنشئ تنفيذاً موازياً أبداً.** أي طبقة أو منصة
جديدة تُبنى كواجهة (facade) فوق الوحدات المرجعية، لا كنسخة بديلة عنها.

## جدول الوحدات المرجعية

| المسؤولية | الوحدة المرجعية | الجدول المرجعي | ملاحظات |
|---|---|---|---|
| مصفوفة الصلاحيات المالية (T0–T3) | `lib/company/governance.ts` | — (نقية) | المصدر الوحيد لعتبات الاعتماد |
| مركز القرار (الاعتمادات المعلقة) | `lib/approvals.ts` | `company_approvals` | الكتابة عبر `createApprovalCritical` / `decideApprovalCritical` |
| سجل التدقيق | `lib/company/audit.ts` | `audit_log` | append-only، والكتابات الحساسة مؤكدة قبل نجاح الطلب |
| تنفيذ القرار المؤسسي بعد الاعتماد | `lib/company/governedApprovalExecution.ts` | جداول الكيانات + `business_actions` | انتقالات مسموحة صراحةً، ولا يقبل جدولاً أو حمولة عشوائية |
| القيود المحاسبية | `lib/accountingRepository.ts` | `accounting_journal_entries/lines` عبر RPC `orvanta_post_journal_entry` | `lib/company/ledger.ts` طبقة توافق فوقه |
| سجل الوكلاء والهيكل التنظيمي | `lib/company/agents.ts` | — | `lib/agents.ts` = مشغّل الوكلاء (prompt runner) وليس سجلاً |
| استدعاء نماذج AI | `lib/ai.ts` + `lib/aiStructured.ts` | `ai_usage_log` | القرارات المنظمة عبر `runAgentStructured` حصراً |
| تنفيذ الفكرة المعتمدة | `lib/company/ideaExecution.ts` | `projects/tasks/kpis/business_actions` | يُستدعى من مسار الاعتماد |
| قائمة الإجراءات | `lib/company/actionQueue.ts` | `business_actions` | |
| صندوق القرار الموحد (عرض) | `lib/inbox.ts` | — (واجهة تجميع) | يجمع approvals + decisions ولا يكرر منطقاً |
| سجل إجراءات المراجعة | `lib/decisions.ts` | `company_decisions` | مسؤولية مختلفة عن approvals (ملاحظات مراجعة) |
| سياسات مستويات المخاطر | `lib/company-os/governance.ts` | — | مكمّلة للمصفوفة المالية، ليست بديلاً |

## ما تم دمجه في هذه الجلسة

### 1. إغلاق مركز القرار الموازي (`lib/governanceOS.ts`)

**قبل:** الوحدات المؤسسية الخمس (proAccounting، enterpriseSystems، marketingOS،
executiveOffice، governmentRelations) كانت تُحكم عبر نظام موازٍ كامل:

- جدول سياسات خاص (`approval_policies`) باعتماد تلقائي حتى 1,500 ريال —
  **مخالف** لمصفوفة T0 (5,000 ريال) المعتمدة.
- اعتماداتها المعلقة كانت تُكتب في جدول `approvals` القديم. كانت واجهة
  `/inbox` تجمعها للعرض، لكنها لم تكن جزءاً من سجل `company_approvals`
  المرجعي ولا تستفيد من ضمانات الكتابة ومنع التكرار ومسار التنفيذ الموحد.
- تدقيقها في `decision_audit_log` منفصلاً عن `audit_log` الموحد.

**بعد:** `governanceOS.ts` أصبح واجهة فوق المرجعيات — نفس أسماء الدوال ونفس
شكل الإرجاع، لكن كل إجراء مؤسسي الآن:

- يُقيَّم بمصفوفة `effectiveTier` الموحدة؛ HIGH وCRITICAL يصعدان فعلياً إلى
  T2/المالك حتى لو كان المبلغ ضمن T0، ويستخدم API الاعتماد الفئة المحفوظة.
- يصل معلقاً إلى `company_approvals` عبر `createApprovalCritical` (كتابة مؤكدة).
- يحمل مفتاح منع تكرار ثابتاً وعمود `dedupe_key` مفهرساً على مستوى المستأجر،
  لذلك لا يكرر الطلب بعد cold start في Vercel.
- يُدقَّق في `audit_log` الموحد مع metadata كاملة وكتابة مؤكدة.
- يغيّر حالة الكيان و`business_actions` بعد الاعتماد أو الرفض عبر منفذ آمن
  ومحدد الأنواع (إغلاق الفترة، الحملات، رادار الفرص، التجديد الحكومي، مشروع التنفيذ).
- يعمل بلا Supabase أيضاً (كان يشترطه سابقاً).

مغطى باختبارات انحدار، منها اختبار يثبت أن
عتبة 3,000 ريال تتبع المصفوفة الموحدة لا القواعد القديمة.

### 2. إغلاق ازدواجية الحملة والتنفيذ الحالي

- تُنشأ الحملة أولاً بحالة `PENDING_GOVERNANCE` ثم يربط اعتماد واحد بمعرّفها؛
  حُذفت الكتابة الثانية إلى جدول `approvals` القديم.
- مشروع `companyExecutionSystem` أصبح يكتب إلى `company_approvals` ويمنع
  المهام والإجراءات من البدء قبل الاعتماد، ثم يفكها منفذ القرار عند الموافقة.
- القواعد المعروضة في `businessBrain` و`enterpriseSystems` تُشتق الآن من
  مصفوفة T0–T3 بدلاً من أرقام مستقلة.

### 3. توحيد سجل التدقيق فعلياً

- قُرّاء الأنظمة المؤسسية والمكتب التنفيذي والعلاقات الحكومية نُقلوا إلى
  `audit_log`.
- ترحيل قاعدة البيانات ينقل السجل التاريخي من `decision_audit_log` دون حذف
  الأصل، ويضيف metadata المنظمة بصورة idempotent.

### 4. حذف الوحدات الميتة (صفر مستورد، تحقق شامل)

```txt
lib/documentText.ts
lib/sheets.ts
lib/workflows.ts
lib/permissions.ts
lib/integrations/googleCalendar.ts
```

### 5. ما فُحص وتبيّن أنه ليس تكراراً

- `lib/decisions.ts` مقابل `lib/approvals.ts`: مسؤوليتان مختلفتان (سجل مراجعة
  مقابل مركز اعتماد)، و`lib/inbox.ts` يوحّد العرض فوقهما أصلاً.
- `lib/agentMemory.ts` مقابل `lib/company-os/memory.ts`: مخزن ذاكرة قرارات
  مقابل تحقق من روابط المعرفة — مكمّلان.
- `lib/company/governance.ts` مقابل `lib/company-os/governance.ts`: مصفوفة
  مالية مقابل سياسات مخاطر — مكمّلان.

## قائمة الدمج المتبقية (بالترتيب)

| # | التكرار | الوحدة المرجعية المقترحة | الحجم |
|---|---|---|---|
| 1 | ثلاثة محركات تنفيذ: `companyExecutionSystem.ts` (562 سطراً) و`company/ideaExecution.ts` و`company-os/lifecycle.ts` | `company/ideaExecution` للدورة الأساسية، وتحويل `companyExecutionSystem` إلى واجهة قراءة (dashboard) فقط | كبير — جلسة مستقلة |
| 2 | `proAccounting.ts` (581 سطراً) يحمل دليل حسابات وقيوداً خاصة به | إعادة توجيه ترحيلاته إلى `accountingRepository` (RPC) وإبقاؤه طبقة تقارير | متوسط |
| 3 | `enterpriseSystems.ts` يكرر أفكار/فرص `company/ideas` | تحويل مساراته إلى `company/ideas` + `governanceOS` (المدموج) | متوسط |
| 4 | تسمية مضللة: `lib/agents.ts` (مشغّل) مقابل `lib/company/agents.ts` (سجل) | إعادة تسمية `lib/agents.ts` إلى `lib/agentRunner.ts` | صغير |

> تنبيه للموجات القادمة: إضافة "منصة" جديدة (كما حدث مع Company Brain) دون
> المرور بجدول الوحدات المرجعية أعلاه يعيد إنتاج نفس الانقسام الذي أغلقناه هنا.
