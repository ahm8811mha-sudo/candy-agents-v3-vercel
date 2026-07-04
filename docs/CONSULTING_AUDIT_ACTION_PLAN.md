# خطة إصلاح الملاحظات الاستشارية — Candy Agents / Golden Star Enterprise OS

هذه الوثيقة تحوّل الملاحظات الاستشارية إلى خطة تنفيذ واضحة داخل الريبو. الهدف ليس إضافة واجهات أكثر، بل نقل النظام من “عرض ذكي” إلى “نظام تشغيل شركة” يقفل الدورة كاملة:

```txt
Idea → Feasibility → Approval → Execution → KPI Review → Scale / Hold / Kill
```

---

## 0) الحكم التنفيذي

النظام قابل للنجاح، لكنه لا يجب أن يُباع أو يُعرّف كـ “شركة AI مستقلة بالكامل” في هذه المرحلة. التعريف الصحيح الآن:

> Arabic-first AI Owner Operating System for SMBs: مركز قرار وتنفيذ ومتابعة لصاحب العمل.

التركيز المطلوب: تقليل الفوضى التشغيلية، تحويل الأفكار إلى قرارات، ثم تحويل القرارات المعتمدة إلى مشاريع ومهام ومؤشرات قابلة للمتابعة.

---

## 1) أهم الإصلاحات التي يجب أن تكون غير قابلة للتفاوض

| الأولوية | الملاحظة | القرار التنفيذي | الحالة |
|---|---|---|---|
| P0 | اعتماد الفكرة كان لا يغلق دورة التنفيذ | عند اعتماد `IDEA` من مركز القرار يتم إنشاء مشروع + مهام + KPIs + actions + audit | ✅ مطبق في `lib/company/ideaExecution.ts` و`app/api/approvals/decisions/route.ts` |
| P0 | استخدام Supabase anon key للكتابة من الخادم خطر | الخادم لا يقبل إلا `SUPABASE_SERVICE_ROLE_KEY` | ✅ مطبق في `lib/supabase.ts` |
| P0 | الإنتاج يجب ألا يعمل بصلاحيات مفتوحة | `AUTH_ENABLED=true` إلزامي في الإنتاج | مطلوب في Vercel |
| P0 | وجود أكثر من مصدر مالي | جعل Ledger هو المصدر المالي الرسمي | مطلوب |
| P0 | معظم الأفعال الخارجية جاهزة للتكامل فقط | تحويل `READY_FOR_INTEGRATION` إلى تكاملات حقيقية تدريجيًا | مطلوب |
| P1 | الواجهة تعرض إحساس شركة، لكن لا توضّح التنفيذ بعد الاعتماد كفاية | إضافة سجل: ماذا حدث بعد الاعتماد؟ | مطلوب |
| P1 | الـ AI يعطي توصيات بدون evidence كافٍ | كل توصية يجب أن تعرض assumptions + evidence + confidence | مطلوب |
| P1 | الرادار اليومي يعتمد على pool ثابت | ربطه بمصادر بيانات حقيقية | مطلوب |

---

## 2) Business Model

### الملاحظة
النموذج واسع جدًا: استثمار، تجارة، تداول، تسويق، CRM، علاقات حكومية، BI، محاسبة. هذا يضعف الرسالة البيعية.

### القرار
ابدأ بتموضع واحد:

> نظام تشغيل لصاحب عمل صغير أو متوسط في السعودية والخليج، يربط القرارات المالية والتشغيلية بالاعتماد والتنفيذ والمتابعة.

### نموذج الربح المقترح

| الباقة | العميل | السعر المقترح | المحتوى |
|---|---|---:|---|
| Solo Owner | صاحب مشروع صغير | 99–199 ريال/شهر | مركز قرار + أفكار + تقارير + مهام |
| Business | شركة صغيرة | 399–799 ريال/شهر | أقسام + صلاحيات + مشاريع + KPIs |
| Pro Ops | شركة نشطة | 1,500–3,000 ريال/شهر | تكاملات + تقارير + إعداد مخصص |
| Implementation | إعداد أولي | 3,000–15,000 ريال مرة واحدة | ربط البيانات، القوالب، التدريب |

### لا تبدأ بهذه الأشياء تجاريًا
- تداول حقيقي بأموال العميل.
- وعود أرباح استثمارية.
- تنفيذ مالي مباشر بدون اعتماد بشري.

---

## 3) Operating Model

### الملاحظة
نموذج التشغيل مكتوب جيدًا، لكن يجب ضمان أن كل مرحلة لها مخرج قابل للتنفيذ.

### المسار المعتمد

```txt
1. Discovery
   مصدرها: المالك / Radar / بيانات المتجر / CRM / السوق

2. Triage
   CEO Agent يقرر هل تستحق دراسة أم لا.

3. Feasibility
   Finance + Marketing + Operations + Supply Chain + Government Relations عند الحاجة.

4. Approval
   حسب مصفوفة الصلاحيات.

5. Execution
   مشروع + مهام + KPIs + actions.

6. Monitoring
   Budget vs Actual + KPI drift + blockers.

7. Scaling Decision
   Scale / Hold / Kill.
```

### قاعدة صارمة
لا يوجد execution بدون approval، ولا يوجد approval بدون feasibility إذا تجاوزت الفكرة T0.

---

## 4) Organizational Structure

### الهيكل المعتمد

| الدور | المسؤولية | حدود الصلاحية |
|---|---|---|
| Owner | السلطة النهائية | T2/T3 |
| Sultan / CEO Agent | فرز وتوصية واعتماد T1 | حتى 25,000 ريال |
| CFO | ميزانية، جدوى، مخاطر مالية | حتى 5,000 ريال |
| CMO | سوق، حملات، عروض | حتى 5,000 ريال |
| COO | مشاريع، مهام، جودة، تنفيذ | حتى 5,000 ريال |
| CRM/Sales | عملاء، مبيعات، فرص | حتى 5,000 ريال |
| Supply/Procurement | موردين، مخزون، تكلفة توريد | حتى 5,000 ريال |
| Government Relations | تراخيص وامتثال | بدون صرف مستقل |
| Risk/Governance | إيقاف المخاطر وسجل التدقيق | بدون صرف مستقل |

### RACI مختصر

| المرحلة | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Idea | Radar / Owner | CEO | Marketing / Finance | Owner |
| Feasibility | Finance / Marketing / Ops | CEO | Supply / Gov / CRM | Owner |
| Approval | Governance | Owner أو CEO | CFO / Risk | All |
| Execution | Operations | CEO | Finance / Supply / CRM | Owner |
| KPI Review | BI / Risk | CEO | Department Heads | Owner |
| Scaling | CEO | Owner | CFO / CMO / COO | All |

---

## 5) Execution Capability

### المشكلة
النظام كان ينشئ توصيات وموافقات، لكن بعض العناصر لا تتحول إلى تنفيذ حقيقي بعد الاعتماد.

### ما تم إصلاحه
- اعتماد `IDEA` من `/api/approvals/decisions` أصبح يشغّل `executeApprovedIdea`.
- `executeApprovedIdea` ينشئ:
  - Project
  - Tasks
  - Business KPIs
  - Business Actions
  - Business Memory
  - Audit Log

### المطلوب بعد ذلك

| الإجراء | السبب |
|---|---|
| إضافة صفحة “ما بعد الاعتماد” | حتى يرى المستخدم أن الفكرة تحولت إلى مشروع |
| إضافة action timeline | كل إجراء: queued / waiting integration / running / done / failed |
| ربط business_actions بمحركات تنفيذ | Email, WhatsApp, Shopify, Google Sheets |
| منع تكرار التنفيذ | idempotency key لكل approval/action |

---

## 6) AI Reliability

### المشكلة
الـ AI قد يعطي كلامًا مقنعًا بلا بيانات كافية.

### القواعد المطلوبة لكل Agent

```txt
Output Contract:
- Recommendation
- Confidence score
- Assumptions
- Evidence/data used
- Risk flags
- Required approval tier
- Next executable action
```

### Guardrails

| الخطر | التحكم |
|---|---|
| Hallucination | لا تقبل توصية بلا evidence |
| Prompt injection | عزل الأدوات وربطها بصلاحيات |
| تنفيذ خاطئ | approval gate + dry-run |
| توصيات متضاربة | CEO aggregate + Risk review |
| ضعف البيانات | إظهار “insufficient data” بدل تقرير مزيف |
| fallback/demo | وسم واضح: Heuristic / Demo / LLM |

---

## 7) Governance & Control

### ما هو جيد
- توجد مصفوفة صلاحيات T0/T1/T2/T3.
- الاعتماد يتم في API وليس الواجهة فقط.
- يوجد audit log.

### المطلوب

| المطلوب | القرار |
|---|---|
| AUTH_ENABLED | يجب تفعيله في Vercel production |
| API_SECRET_KEY | يجب ضبطه للعمليات النظامية فقط |
| Supabase RLS | لا تستخدم سياسات anon العامة للجداول الحساسة |
| Approval Evidence | كل اعتماد يعرض المستندات/الأرقام التي بني عليها |
| Immutable Audit | لا update/delete لسجل التدقيق |

### سياسة إنتاج صارمة

```env
AUTH_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
OPENAI_API_KEY=...
API_SECRET_KEY=...
```

لا تستخدم:

```env
SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

للعمليات الحساسة من الخادم.

---

## 8) Financial System

### المشكلة
يوجد أكثر من مسار مالي:
- `transactions`
- `ledger_entries`
- `financial_decisions`
- `accounting_*`

هذا خطر لأنه يخلق أرقامًا مختلفة لنفس الشركة.

### القرار
اجعل `ledger_entries` هو المصدر المالي الرسمي، واجعل `transactions` واجهة إدخال فقط أو ألغها تدريجيًا.

### النظام المالي المطلوب

| الوحدة | المطلوب |
|---|---|
| Chart of Accounts | أصول، التزامات، حقوق ملكية، إيرادات، مصروفات |
| Double-entry ledger | كل قيد متوازن |
| Project P&L | ربحية كل مشروع |
| Budget vs Actual | مقارنة المعتمد بالمصروف |
| Cash Forecast | توقع السيولة |
| VAT/ZATCA | فواتير وVAT 15% |
| Close Period | إقفال شهري |

---

## 9) UX/Product

### الجيد
الواجهة تعطي شعور “أملك شركة”، وهذا مهم.

### الناقص
المستخدم يحتاج يرى النتيجة التنفيذية وليس فقط التقرير.

### تعديل UX المطلوب

| الشاشة | المطلوب |
|---|---|
| Home | قرار اليوم + ما حدث بعد آخر اعتماد |
| Inbox | سبب القرار + أثره المالي + زر اعتماد واضح |
| Project | مهام، KPIs، budget, blockers |
| Office | نشاط حقيقي مشتق من الأحداث لا animation |
| Finance | Ledger + P&L + cash risk |
| Ideas | idea status واضح: study / pending / approved / executing |
| Actions | queue موحد لكل الأفعال التنفيذية |

### العبارة الأساسية للمنتج

> لا يعرض النظام تقارير فقط؛ كل قرار معتمد يتحول إلى مشروع قابل للقياس.

---

## 10) Competition & Differentiation

### لا تنافس كالتالي
- “نحن مثل Salesforce/ServiceNow لكن AI”.
- “Agents تفعل كل شيء”.

### نافس بهذه الزاوية

> Arabic-first AI Operating System for Saudi/GCC SMB owners with governance, approvals, execution tracking, and Arabic financial/operational reporting.

### ميزتك الممكنة

| الميزة | لماذا مهمة |
|---|---|
| Arabic-first | أغلب المنافسين مترجمون لا مصممون للعربية |
| Owner decision center | صاحب العمل يريد قرارات لا dashboards |
| Saudi finance/governance | SAR, VAT, ZATCA, صلاحيات |
| SMB templates | مصنع، متجر، خدمات، مطعم، تجارة |
| Execution trace | كل قرار له أثر قابل للتتبع |

---

## 11) Roadmap

### أول 14 يوم

| اليوم | المهمة |
|---|---|
| 1 | تفعيل AUTH_ENABLED في Vercel |
| 1 | ضبط SUPABASE_SERVICE_ROLE_KEY فقط للكتابة من الخادم |
| 2 | تشغيل `docs/supabase-schema.sql` |
| 2 | التأكد أن approval IDEA ينشئ مشروع فعلي |
| 3 | إضافة Timeline للـ project بعد الاعتماد |
| 4 | توحيد المالية حول Ledger |
| 5 | إضافة status واضح لكل action |
| 6 | وسم Demo/Heuristic/LLM في التقارير |
| 7 | اختبار flow كامل: فكرة → اعتماد → مشروع → KPI |
| 8–10 | تحسين Inbox وتوضيح أثر القرار |
| 11–12 | إضافة idempotency للأفعال التنفيذية |
| 13 | اختبار permissions |
| 14 | إطلاق pilot داخلي |

### 30 يوم

| المسار | الهدف |
|---|---|
| Shopify أو CRM | تكامل واحد حقيقي |
| Finance | Project P&L |
| Agents | output contract موحد |
| UX | owner cockpit واضح |
| QA | agent evaluation suite |

### 90 يوم

| الهدف | النتيجة |
|---|---|
| 3–5 عملاء تجريبيين | استخدام حقيقي |
| Billing | اشتراكات |
| Multi-tenant | كل شركة معزولة |
| Audit Export | PDF/CSV للقرارات |
| Mobile | بعد ثبات الويب فقط |

---

## 12) Definition of Done

لا تعتبر النظام “مكتمل” حتى تتحقق هذه الشروط:

- [ ] كل فكرة معتمدة تتحول إلى مشروع فعلي.
- [ ] كل مشروع له budget وKPIs وowner وtimeline.
- [ ] كل action له status وتاريخ ومحاولة تنفيذ.
- [ ] كل مبلغ مالي مربوط بقيد Ledger.
- [ ] كل قرار له audit trail.
- [ ] كل توصية AI تعرض evidence وconfidence.
- [ ] الإنتاج يعمل بـ `AUTH_ENABLED=true`.
- [ ] لا توجد صلاحيات anon write على الجداول الحساسة.
- [ ] المستخدم يرى ماذا حدث بعد الاعتماد.
- [ ] يوجد pilot حقيقي يقيس قيمة النظام.

---

## 13) الخلاصة الصريحة

النظام الآن لا يحتاج “ميزات أكثر”. يحتاج إغلاق الفجوات بين:

```txt
الكلام → القرار → التنفيذ → القياس → التوسيع
```

أي شاشة أو Agent لا يخدم هذه الدورة يجب تقليله أو تأجيله.

الأولوية ليست أن يشعر المستخدم أن لديه شركة فقط، بل أن يرى أن الشركة:

1. اكتشفت فرصة.
2. درستها.
3. طلبت اعتماده.
4. نفذتها بعد الاعتماد.
5. قاست النتيجة.
6. أوصت بالتوسيع أو الإيقاف.

هذا هو المنتج الحقيقي.
