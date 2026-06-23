# Golden Star Enterprise OS

تم تحويل المشروع من نموذج Vite / index.html إلى أساس نظام شركة داخلي مبني على Next.js + Supabase + Vercel.

## ما الذي تم بناؤه

- لوحة قيادة Apple-style
- إدارة موظفين
- إدارة مهام Kanban
- سجلات يومية للموظفين
- مركز موافقات
- تنبيهات ونشاط مباشر
- API routes أساسية
- طبقة Supabase جاهزة
- مخطط قاعدة بيانات SQL
- سياسات RLS أولية
- Google Sheets service كطبقة تصدير اختيارية وليس قاعدة بيانات رئيسية
- Health check endpoint

## التشغيل

```bash
npm install
npm run dev
```

## النشر

Vercel سيتعرف على المشروع كتطبيق Next.js. أمر البناء:

```bash
npm run build
```

## إعداد Supabase

1. أنشئ مشروع Supabase.
2. افتح SQL Editor.
3. شغّل `database/schema.sql`.
4. شغّل `database/policies.sql`.
5. اختياريًا شغّل `database/seed.sql`.

## المتغيرات المطلوبة في Vercel

أضف متغيرات Supabase الأساسية، ثم متغيرات Google Sheets وAI عند الحاجة. لا تضع أي مفاتيح داخل ملفات الواجهة أو GitHub.

## Health Check

افتح:

```txt
/api/health
```

سيعرض حالة Supabase وGoogle Sheets وAI.

## ملاحظة مهمة

إذا لم تضبط متغيرات Supabase، سيعمل النظام ببيانات تجريبية حتى لا يتعطل العرض. بعد ربط Supabase ستتحول البيانات إلى قاعدة البيانات الحقيقية.
