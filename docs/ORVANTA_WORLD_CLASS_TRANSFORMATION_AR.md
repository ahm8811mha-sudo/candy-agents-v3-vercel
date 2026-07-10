# ORVANTA — التحول إلى نظام تشغيل شركات عالمي بالذكاء الاصطناعي

## التعريف المستهدف

Orvanta ليس لوحة تحكم أو Chatbot أو مجموعة وكلاء منفصلة. التعريف المستهدف هو:

> نظام تشغيل شركات محكوم يحول النية الاستراتيجية إلى تخصيص رأس مال معتمد، وسير عمل دائم، وتنفيذ حقيقي، ومساءلة مالية، وذكاء تنظيمي يتحسن باستمرار.

## المبدأ التنفيذي

لا يتم تنفيذ التحول بإعادة كتابة شاملة عالية المخاطر. يتم تطبيق Strangler Architecture:

```text
الواجهة وواجهات API الحالية
        ↓
نواة السياسات والقرارات
        ↓
محرك Workflow دائم
        ↓
Event Bus + Outbox
        ↓
خدمات المجالات والموصلات
```

تظل Next.js طبقة تجربة المنتج، بينما تنتقل العمليات الطويلة والحساسة تدريجياً إلى نواة تشغيل مستقلة وقابلة للاستئناف.

---

## 1. التدقيق الصريح

### نقاط القوة

- رؤية تتجاوز أدوات الذكاء الاصطناعي التقليدية.
- دورة فعلية من الفكرة إلى الاعتماد والتنفيذ.
- وجود مبكر للحوكمة وسجل التدقيق وقائمة الإجراءات.
- تخزين دائم في Supabase ودفتر قيد مزدوج كأساس.
- تكاملات Gmail وSheets وDrive منفذة برمجياً.
- فرصة تميز عربية وسعودية قوية.

### نقاط الضعف

- البنية الحالية Application-centric.
- لا يوجد Durable Workflow Runtime مستقل بعد.
- بعض الأدوار ما زالت أسماء ووظائف Prompt أكثر من كونها سلطات مؤسسية مقيدة.
- الذاكرة الحالية أرشيف أحداث وليست Knowledge Graph زمنية كاملة.
- سطح المنتج أوسع من عمق بعض دورات التنفيذ.
- عزل المستأجرين لم يكتمل بعد على مستوى كل جدول وسياسة واختبار.

### المخاطر

- الخلط بين نجاح API ونجاح النتيجة التجارية.
- وجود أكثر من مصدر للحقيقة المالية.
- تنفيذ LLM لقرارات حساسة بلا فصل واجبات.
- ضعف المصادقة أو RLS أو إدارة الأسرار.
- عدم ملاءمة Serverless-only للعمليات طويلة العمر.
- منافسة المنصات العامة؛ يجب أن يكون التميز في الحوكمة والتنفيذ والذاكرة والسياق العربي.

---

## 2. دورة الشركة القياسية

يتم تثبيت دورة واحدة مشتركة لكل استثمار أو فرصة أو مشكلة:

1. اكتشاف الفرصة
2. التحقق
3. التحليل المالي
4. تقييم المخاطر
5. الاعتماد
6. إنشاء المشروع
7. التنفيذ
8. مراقبة الأداء
9. التحسين
10. التوسع أو التعليق أو الإيقاف

التعريف البرمجي موجود في:

```text
lib/company-os/lifecycle.ts
```

كل مرحلة تحتوي على المدخلات والمخرجات والمحركات المسؤولة ودور الإنسان والاعتماد ومؤشرات النجاح.

---

## 3. الهيكل التنظيمي

### الطبقات

1. المالك
2. مجلس الإدارة التنفيذي بالذكاء الاصطناعي
3. محركات الأعمال
4. محركات سير العمل
5. عمال التنفيذ

### مجلس الإدارة

- AI CEO
- AI CFO
- AI COO
- AI CRO
- AI Chief Growth Officer

### محركات الأعمال

- Opportunity Engine
- Strategy Engine
- Finance Engine
- Operations Engine
- Governance Engine
- Growth Engine
- Customer Engine
- Supply Chain Engine

### قاعدة الصلاحية

```text
Recommend: محرك المجال
Agree: المالية/المخاطر/القانون
Perform: Workflow + Worker
Input: المحركات المتأثرة
Decide: السلطة المحددة في المصفوفة
```

لا يجوز لجهة واحدة اقتراح قرار مادي واعتماده وتنفيذه وتسويته منفردة.

التعريف البرمجي موجود في:

```text
lib/company-os/organization.ts
```

---

## 4. الحوكمة المؤسسية

المستويات:

- LOW
- MEDIUM
- HIGH
- CRITICAL

التصنيف لا يعتمد على القيمة فقط، بل على:

- أثر العميل
- البيانات الحساسة
- الالتزام القانوني
- الإجراء النظامي
- الأثر الأمني
- عدم قابلية التراجع
- استمرارية الأعمال
- قيمة الالتزام بالريال

التعريف البرمجي والاختبارات موجودة في:

```text
lib/company-os/governance.ts
lib/company-os/governance.test.ts
```

---

## 5. مجلس الإدارة بالذكاء الاصطناعي

اجتماعات المجلس:

- اجتماع تشغيلي يومي للاستثناءات.
- اجتماع تنفيذي أسبوعي للأهداف والموارد والمخاطر.
- اجتماع شهري لتخصيص رأس المال.
- اجتماع حادثة عند المخاطر الحرجة.

كل قرار مادي يجب أن يحتوي على:

- حقائق
- افتراضات
- خيارات
- أثر مالي
- مستوى خطر
- رأي معارض
- معتمدين
- معايير نجاح
- معايير إيقاف
- تاريخ مراجعة

آلية الخلاف:

1. محرك المجال يوصي.
2. CRO يقدم Challenge Case.
3. CFO يقدم سيناريو سلبي.
4. مراجع مستقل يتحقق.
5. CEO يلخص الخلاف.
6. الخلاف المادي غير المحسوم يصعد للمالك.

التعريف البرمجي موجود في:

```text
lib/company-os/board.ts
```

---

## 6. الذاكرة المؤسسية

تتكون من:

- Knowledge Base بإصدارات وصلاحية ومالك ومصدر.
- Temporal Knowledge Graph.
- Historical Decision Archive.
- Lessons Learned Repository.

يجب ربط القرار بكيانات مثل:

- الفرصة
- الهدف
- العميل
- المورد
- المشروع
- العقد
- الحركة المالية
- النتيجة

حلقة التعلم:

```text
قرار → تنفيذ → نتيجة → تقييم → درس → تغيير سياسة/Playbook → قرار أفضل
```

التعريف البرمجي والمخطط موجودان في:

```text
lib/company-os/memory.ts
docs/supabase-world-class-os.sql
```

---

## 7. البنية المؤسسية

البنية المستهدفة:

```text
Web / iOS / Public APIs
Identity + API Gateway
Command & Decision Layer
Policy Engine
Durable Workflow Engine
Event Bus + Outbox
Domain Services
Execution Connectors
```

طبقة البيانات:

- Operational Postgres
- Financial Ledger
- Event Store
- Object Storage
- Analytics Warehouse
- Vector Index
- Temporal Knowledge Graph
- Observability Platform

معايير الاستمرارية:

- توفر أولي 99.95%.
- مسارات مالية حرجة 99.99%.
- RPO لا يتجاوز خمس دقائق.
- RTO لا يتجاوز ثلاثين دقيقة.
- نسخ احتياطي واختبار استعادة فعلي.

---

## 8. محرك المالية

العملة الأساسية للتقارير: SAR.

الوحدات:

- General Ledger
- Chart of Accounts
- AP/AR
- Budgeting
- Commitments
- Cash Management
- Revenue Recognition
- Profitability
- Tax/ZATCA
- Forecasting
- Reconciliation

التسلسل الإلزامي:

```text
ميزانية متاحة
→ حجز التزام
→ اعتماد
→ تنفيذ
→ إيصال/فاتورة
→ قيد دفتر الأستاذ
→ تسوية
```

ضوابط البرمجة موجودة في:

```text
lib/company-os/finance.ts
lib/company-os/finance.test.ts
```

---

## 9. تجربة المنتج

المالك يجب أن يحصل فوراً على إجابات خمسة:

1. ما الذي يحتاج قراري؟
2. هل الشركة بصحة جيدة؟
3. أين يذهب النقد؟
4. ما الذي خرج عن المسار؟
5. ما الإجراء الأهم اليوم؟

الأسطح المستهدفة:

- CEO Dashboard
- Executive Cockpit
- Enterprise Control Room
- Investment Center
- Operations Center
- Governance Center
- Company Health Center

تم إنشاء أول Enterprise Control Room على المسار:

```text
/control-room
```

---

## 10. نظام التصميم

الاتجاه:

```text
Apple simplicity + enterprise clarity + transparent AI + Arabic-first UX
```

المبادئ:

- Minimalism
- Visual hierarchy
- Focus
- Transparency
- Decision-centric design
- Progressive disclosure

كل توصية يجب أن تكشف:

- السبب
- المصادر
- الافتراضات
- الثقة
- السياسة
- الأثر المتوقع
- البديل

---

## 11. الأداء

الأهداف الأساسية:

- UI أقل من 100ms.
- Client navigation أقل من 300ms.
- شاشة قابلة للاستخدام أقل من 1.5s عند p75.
- API read أقل من 200ms عند p95.
- Workflow acknowledgment أقل من 500ms.
- أول تحديث Streaming أقل من ثانيتين.
- خطة AI أولية أقل من خمس ثوان.
- تحليل معقد أقل من 15 ثانية عند p95.

التقنيات:

- CDN
- tenant-aware Redis
- Executive read models
- Materialized financial views
- SSE/WebSockets
- Async AI jobs
- Model routing
- Prompt caching
- Circuit breakers

---

## 12. الميزة التنافسية

ليست ميزة تنافسية:

- كثرة الوكلاء
- لوحة جميلة
- ربط LLM
- مسميات CEO/CFO
- تقارير مولدة

الميزة الحقيقية:

- نواة سياسات وتنفيذ دائم.
- بيانات قرارات ونتائج وانحرافات.
- Workflows صناعية قابلة لإعادة الاستخدام.
- حوكمة تتعلم شهية المخاطر والصلاحيات.
- Knowledge Graph زمنية.
- تجربة عربية وسعودية وSAR وZATCA.

---

## 13. نموذج الأعمال

### Core

1,500–3,000 ريال شهرياً.

### Growth

8,000–15,000 ريال شهرياً.

### Enterprise

250,000–1,000,000+ ريال سنوياً.

مصادر الإيراد:

- الاشتراك
- تنفيذ المؤسسات
- استخدام AI
- Marketplace للموصلات وWorkflows
- الخدمات الاحترافية

السوق الأول:

الشركات السعودية التي يقودها المالك، بعدد 20–500 موظف، وتعاني من تشتت الاعتمادات وضعف رؤية النقد والاعتماد المفرط على الإدارة اليدوية.

---

## 14. خارطة الطريق

### المرحلة 1 — Foundation

الأمان والديمومة والحوكمة والقياس.

### المرحلة 2 — Operational Intelligence

Knowledge Graph، Board، Forecasting، Company Health.

### المرحلة 3 — Autonomous Execution

Lead-to-cash وProcure-to-pay وCampaign-to-revenue والتسوية الآلية.

### المرحلة 4 — Enterprise Scale

SSO وRBAC/ABAC وتعدد الكيانات وDR وModel Governance.

### المرحلة 5 — Global Category Leadership

منظومة موصلات عالمية وIndustry Packs وMarketplace وBenchmarks.

التعريف البرمجي الكامل للخارطة موجود في:

```text
lib/company-os/blueprint.ts
```

---

## ما تم تنفيذه في هذه الدفعة

- Canonical domain types.
- دورة الشركة ذات المراحل العشر.
- مصفوفة المخاطر والاعتماد.
- هيكل مجلس الإدارة والمحركات والعمال.
- Decision Packet protocol.
- Event envelope وOutbox contract.
- ضوابط الميزانية والتسوية والقيد المتوازن.
- Knowledge Graph contracts.
- مخطط Supabase موسع.
- API لقراءة Blueprint.
- Enterprise Control Room.
- اختبارات للحوكمة والدورة والأحداث والمالية والمجلس.
- إدراج مركز القيادة في التنقل.

## ما لا يمكن اعتباره مكتملاً بعد

وجود التعريفات والمخططات لا يعني أن التحول المؤسسي انتهى. الأعمال التالية تحتاج دفعات تنفيذ مستقلة واختبارات إنتاجية:

- تشغيل migration في Supabase الحقيقي.
- ربط Auth وtenant claims بسياسات RLS.
- إدخال Temporal أو Workflow Runtime فعلي.
- تشغيل Publisher للـOutbox وDead-letter queue.
- نقل التدفقات الحالية إلى الـWorkflows الجديدة تدريجياً.
- بناء Knowledge Graph ingestion وretrieval فعلي.
- ربط كل أثر مالي بالدفتر والتسوية.
- إضافة SSO/MFA وABAC للمؤسسات.
- إضافة Warehouse وObservability وModel Evals.
- استكمال Connectors والاختبارات End-to-End.

هذه الوثيقة هي المرجع المعماري والتنفيذي، وليست إعلاناً بأن جميع مراحل 36 شهراً أصبحت مكتملة في دفعة برمجية واحدة.
