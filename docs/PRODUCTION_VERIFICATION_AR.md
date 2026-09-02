# التحقق من الجاهزية على الإنتاج

## لماذا لا تُفتح البوابات بمتغير بيئة

بوابات الجاهزية الأربع التالية:

```
migration-baseline · rls-regression-tested · tenant-rls-ready
execution-transaction · accounting-controls · capability-registry
```

**لا تقرأ متغيرات البيئة إطلاقاً.** الكود في `lib/company/productionReadinessEvidence.ts`
يتجاهل أعلام مثل `ORVANTA_CORE_SCHEMA_READY` و`ORVANTA_RLS_READY`، ويقرأ بدلاً منها
جدول `readiness_evidence` في قاعدة البيانات: لا يمر البند إلا إذا وُجد سجل `PASS`
لم تنتهِ صلاحيته. هذا مقصود — البوابة لا تُصدَّق بادعاء، بل بفحص جرى فعلاً.

## لماذا على الإنتاج تحديداً

`Database Security` يتحقق على قاعدة staging ويسجّل إثباته تحت `environment=staging`،
بينما صفحة الجاهزية في الإنتاج تقرأ `environment=production`. وهذا صحيح ولا يجب
«إصلاحه» بجعل staging تُحتسب للإنتاج: سياسات RLS والصلاحيات وسجل الهجرات على قاعدة
الإنتاج شيء مختلف عن نسخة staging. الطريق الصادق الوحيد هو التحقق على الإنتاج نفسه،
وهذا ما يفعله `Production Verification`.

## الأسرار المطلوبة وأين توضع بالضبط

**GitHub → Settings → Secrets and variables → Actions → New repository secret**

| السر | ما هو | من أين تجلبه |
|---|---|---|
| `PRODUCTION_DB_URL` | رابط اتصال Postgres مباشر بقاعدة الإنتاج (يستخدمه `psql`) | Supabase → Project Settings → Database → Connection string → URI |
| `PRODUCTION_SUPABASE_URL` | عنوان مشروع Supabase | Supabase → Project Settings → API → Project URL |
| `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` | مفتاح الخادم (Secret / service_role) | Supabase → Project Settings → API Keys |

بدونها لا يفشل الـ workflow، بل يتخطّى ويكتب ملاحظة، وتبقى البوابات حمراء — وهو
السلوك الصحيح: لا إثبات، لا اعتماد.

`PRODUCTION_SUPABASE_URL` و`PRODUCTION_SUPABASE_SERVICE_ROLE_KEY` يستخدمهما أيضاً
`Browser E2E` لتسجيل إثبات `browser-e2e` عند كل دفع على `main`.

## ماذا يشغّل، وهل هو آمن على الإنتاج

| الفحص | الملف | الأثر على البيانات |
|---|---|---|
| حدود RLS | `supabase/tests/rls_regression.sql` | لا يكتب إلا في جداول مؤقتة |
| العقل المؤسسي | `supabase/tests/company_brain_regression.sql` | لا يكتب إلا في جداول مؤقتة |
| ذرّية التنفيذ | `supabase/tests/execution_bundle.sql` | يكتب داخل معاملة تُلغى، بمستأجر اختبار مخصص |
| ضوابط المحاسبة | `supabase/tests/accounting_controls_regression.sql` | يكتب داخل معاملة تُلغى |
| استمرارية غياب المالك | `supabase/tests/owner_absence_continuity.sql` | يكتب داخل معاملة تُلغى |
| سلسلة الهجرات | `scripts/check-migration-chain.mjs` | قراءة فقط |

قبل تشغيل أي ملف، هناك خطوة تمنع التشغيل إذا لم ينتهِ الملف بـ `rollback;`. أي أن
تعديلاً مستقبلياً يجعل أحد الاختبارات يثبّت كتابته سيوقف المسار بدل أن يكتب في
قاعدة الإنتاج.

## متى يعمل

- يدوياً: Actions → Production Verification → Run workflow
- تلقائياً: كل يوم اثنين. الإثبات صالح ١٤ يوماً، فإذا توقف التشغيل تعود البوابات
  حمراء من تلقاء نفسها بدل أن تستند إلى فحص قديم.

## القاعدة التي لا تُكسر

يُسجَّل الإثبات **لكل فحص نجح وحده**. الفحص الفاشل لا يُسجّل شيئاً، وتبقى بوابته
حمراء. لا تُضِف سطراً يسجّل `PASS` دون فحص يسنده — عندها تصبح صفحة الجاهزية تكذب،
وهي الشيء الوحيد الذي يُفترض ألا يكذب في هذا النظام.

## سلسلة الهجرات

`scripts/check-migration-chain.mjs` يقارن ملفات `supabase/migrations/` بجدول
`supabase_migrations.schema_migrations` في قاعدة الإنتاج. إذا طبّقت هجرة يدوياً من
محرر SQL فلن تكون مسجّلة في هذا الجدول، وسيفشل الفحص ويسمّي النسخة الناقصة. العلاج:

```bash
supabase link --project-ref <ref>
supabase migration repair --status applied <version>
```

وهذا تسجيل لواقع حدث فعلاً، لا ادعاء بأنه حدث.
