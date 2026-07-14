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
| سجل التدقيق | `lib/company/audit.ts` | `audit_log` | append-only |
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
- اعتماداتها المعلقة تُكتب في جدول `approvals` القديم — **لا تظهر أبداً** في
  مركز القرار الذي يراه المالك في /inbox.
- تدقيقها في `decision_audit_log` منفصلاً عن `audit_log` الموحد.

**بعد:** `governanceOS.ts` أصبح واجهة فوق المرجعيات — نفس أسماء الدوال ونفس
شكل الإرجاع، لكن كل إجراء مؤسسي الآن:

- يُقيَّم بمصفوفة `requiredTier` الموحدة (+ تصعيد إلزامي لأي مخاطرة HIGH).
- يصل معلقاً إلى `company_approvals` عبر `createApprovalCritical` (كتابة مؤكدة).
- يُدقَّق في `audit_log` الموحد.
- يعمل بلا Supabase أيضاً (كان يشترطه سابقاً).

مغطى بـ 5 اختبارات في `__tests__/governanceOS.test.ts`، منها اختبار يثبت أن
عتبة 3,000 ريال تتبع المصفوفة الموحدة لا القواعد القديمة.

### 2. حذف الوحدات الميتة (صفر مستورد، تحقق شامل)

```txt
lib/documentText.ts
lib/sheets.ts
lib/workflows.ts
lib/permissions.ts
lib/integrations/googleCalendar.ts
```

### 3. ما فُحص وتبيّن أنه ليس تكراراً

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
