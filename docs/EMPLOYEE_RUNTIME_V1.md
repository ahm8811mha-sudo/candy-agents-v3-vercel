# Orvanta Employee Runtime V2

آخر تحديث: 2026-07-17

## الهدف

تحويل وكلاء Orvanta من أقسام تنتج تقارير فقط إلى موظفين رقميين مستشارين ومنفذين يعملون بدورة موحدة:

```txt
Trigger
→ Work Order
→ SOP + Capability Check
→ Authority / Risk Gate
→ Execute
→ Verify
→ Receipt
→ KPI
→ Done / Retry / Escalation
```

الاستقلالية هنا مقيدة. الموظف ينفذ العمل الروتيني داخل اختصاصه وحدوده، ويرفع الاعتماد أو الاستثناء إلى الرئيس التنفيذي أو المالك وفق مصفوفة T0–T3.

## ما تم تطبيقه

- سجل برمجي للكفاءات والصلاحيات والبدلاء وKPIs لكل موظف.
- سجل SOP موحد يغطي الإجراءات الأساسية والمساندة لكل قسم.
- أوامر عمل مرقمة بالشكل:

```txt
PRJ-YYYY-XXXXXX/NNN
```

- منع تكرار أمر العمل والحركات المالية والمخزون والعملاء وKPIs.
- تنفيذ قابل للاستئناف مع ثلاث محاولات ثم تصعيد.
- تفويض مؤقت للبديل المسجل فقط، مع الحفاظ على صلاحيات الدور الأصلي وتسجيل التفويض في الإيصال.
- فحص سياسة غياب المالك قبل التنفيذ.
- إيصال لكل خطوة يتضمن الموظف والأداة وhash المدخلات والمرجع والتحقق والتسوية.
- لوحة تشغيل في `/employee-runtime`.
- فحص جاهزية في `/api/employee-runtime/status`.

## الدورات التشغيلية المنفذة

### 1. البيع إلى التحصيل — Order-to-Cash

```txt
طلب مدفوع
→ التحقق من الطلب ومرجع الدفع
→ تسجيل البيع
→ فاتورة البيع والقيد المحاسبي
→ حجز المخزون
→ أمر التجهيز
→ تحديث CRM
→ فحص هامش الربح
→ KPI + إيصال
```

انخفاض هامش الربح عن الحد المحدد يتحول إلى استثناء ولا يُخفى داخل حالة مكتملة.

### 2. الشراء إلى السداد — Purchase-to-Pay

```txt
طلب شراء
→ تقييم المورد
→ فحص T0–T3
→ أمر شراء
→ تأكيد الاستلام
→ إضافة ذرية للمخزون
→ فاتورة الشراء والقيد
→ جدولة المستحق
→ KPI + إيصال
```

النظام لا يحول الأموال للبنك. ينشئ مستحقًا مجدولًا فقط حتى يتوفر موصل بنكي محكوم باعتماد وتسوية.

لا يقبل النظام قيمة اعتماد يرسلها المتصفح. المبالغ حتى T0 تمر وفق السياسة، وما فوقها يتوقف في `WAITING_APPROVAL`.

### 3. الفكرة إلى التنفيذ — Idea-to-Execution

```txt
فكرة معتمدة فعليًا في مركز القرار
→ التحقق من السجل الرسمي
→ فحص الميزانية والمخاطر
→ مشروع
→ مهام
→ KPIs
→ إجراءات تنفيذية
→ ذاكرة + تدقيق + إيصال
```

لا يقبل النظام عنوانًا أو ميزانية أو حالة اعتماد من المتصفح؛ جميعها تُقرأ من سجل الفكرة المعتمدة.

## حالات أمر العمل

```txt
RECEIVED
PLANNED
POLICY_CHECK
WAITING_APPROVAL
READY
EXECUTING
VERIFYING
RECONCILING
DONE
RETRY
ESCALATED
ROLLED_BACK
FAILED
CANCELLED
```

لا تتحول الخطوة إلى `DONE` دون تحقق وإيصال.

## واجهات API

```http
POST /api/employee-runtime/order-to-cash
POST /api/employee-runtime/purchase-to-pay
POST /api/employee-runtime/idea-to-execution
GET  /api/employee-runtime/work-orders?limit=100
POST /api/employee-runtime/work-orders
GET  /api/employee-runtime/status
```

إجراءات التحكم:

```txt
APPROVE
RETRY
RESUME
CANCEL
```

## الحوكمة والاعتماد

- `T0` و`T1`: لا يعتمدها إلا `ADMIN` أو `OWNER` أو `CEO` عند الحاجة.
- `T2`: `ADMIN` أو `OWNER` فقط.
- `T3`: `ADMIN` أو `OWNER` مع تأكيد دراسة جدوى ثلاثية.
- لا يقبل الاعتماد إلا إذا كانت حالة أمر العمل `WAITING_APPROVAL`.
- كل اعتماد يسجل الممثل والدور والفئة والتاريخ ومعرف الطلب.
- المخاطر المرتفعة ترفع مستوى الاعتماد حتى لو كان المبلغ منخفضًا.

## وضع التشغيل الآمن

الوضع الافتراضي هو المحاكاة، حتى مع وجود Supabase:

```env
EMPLOYEE_RUNTIME_MODE=simulation
```

لا يتم تشغيل الأثر الفعلي إلا بوضع المتغير التالي صراحة على الخادم:

```env
EMPLOYEE_RUNTIME_MODE=live
```

في `SIMULATION` تُنفذ دورة القرار والتحقق والإيصالات دون إنشاء مبيعات أو قيود أو مخزون فعلي.

## قاعدة البيانات

الهجرات:

```txt
database/employee-runtime-v1.sql
database/employee-runtime-v2.sql
```

الجداول الرئيسية:

```txt
employee_work_orders
employee_work_order_events
employee_execution_receipts
employee_sales_orders
employee_inventory_items
employee_inventory_reservations
employee_fulfillment_orders
employee_customers
employee_kpi_events
employee_purchase_orders
employee_goods_receipts
employee_payables
```

تم تفعيل RLS على جداول Employee Runtime. دوال المخزون والاستلام غير متاحة لـ `anon` أو `authenticated`، وتنفذ من الخادم عبر `service_role` فقط.

## التكاملات الخارجية

Employee Runtime V2 ينفذ دورة الشركة الداخلية، لكنه لا يدعي وجود موصلات لم يتم ربطها. التنفيذ الخارجي الكامل يحتاج حسابات ومفاتيح API لكل نظام، مثل:

- Shopify أو نظام نقاط البيع لاستقبال الطلبات تلقائيًا.
- بوابة الدفع للتحقق المباشر من الدفعات.
- موصل بنكي للسداد الفعلي بعد الاعتماد.
- Google Ads وMeta للحملات المدفوعة.
- أنظمة الشحن والرسائل والأنظمة الحكومية.

كل موصل جديد يجب أن يطبق:

```txt
Idempotency
→ Authority Gate
→ Tool Execution
→ Verification
→ Reconciliation
→ Execution Receipt
```

## التحقق المنفذ

- اختبار حجز المخزون داخل معاملة مؤقتة ثم `ROLLBACK`.
- اختبار تحديث CRM داخل معاملة مؤقتة ثم `ROLLBACK`.
- اختبار استلام المشتريات مرتين وإثبات أن المحاولة الثانية idempotent.
- التحقق من إزالة بيانات الاختبار بالكامل بعد `ROLLBACK`.
- التحقق من تفعيل RLS على الجداول المطلوبة.
- التحقق من منع `anon` و`authenticated` من تشغيل دوال المخزون، والسماح لـ `service_role` فقط.

## الحالة الحالية

```txt
GitHub implementation: completed
Supabase migrations: applied
Database security tests: passed
Production Vercel deployment: not verified
External business connectors: require credentials and provider setup
```
