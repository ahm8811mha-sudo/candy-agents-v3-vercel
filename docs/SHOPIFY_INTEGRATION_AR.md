# ربط Shopify بالمشروع (منتج واحد: متجر + مستودع + محاسبة)

المنتج سجلّ واحد مشترك بين المتجر (Shopify)، والمستودع (`inventory_items`)،
والدفاتر. المزامنة **ثنائية الاتجاه**:

- **الموقع ← الموقع:** تضيف منتجاً من لوحة المتجر في مشروعك → يُنشأ في Shopify
  (إن كانت الكتابة مفعّلة) + يُسجّل في المستودع + يُسجّل كأصل في المحاسبة.
- **Shopify ← الموقع:** أي إضافة/تعديل/حذف في Shopify تصل عبر webhook موقّع
  (HMAC) وتنعكس على المستودع تلقائياً، دون أن تُعاد كتابتها إلى Shopify (لا حلقة صدى).

## الصدق المحاسبي

إضافة منتج **تسجّل أصلاً فقط** (تكلفته وسعره وكميته الافتتاحية في المستودع).
لا يُرحَّل أي قيد مالي وهمي هنا — القيود الحقيقية (شراء المخزون، البيع، الضريبة)
تُرحَّل فقط عند حدوث معاملة فعلية عبر دورات البيع/الشراء الموجودة، تماماً كبوابة
الإثبات في بقية النظام.

## متغيرات البيئة المطلوبة (في Vercel)

| المتغير | الغرض |
|---------|-------|
| `SHOPIFY_STORE_DOMAIN` | نطاق متجرك، مثل `my-store` أو `my-store.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | Admin API access token (يبدأ بـ `shpat_`) |
| `SHOPIFY_WRITE_ENABLED` | `true` للسماح بالإنشاء/الحذف من الموقع (بدونها قراءة فقط) |
| `SHOPIFY_WEBHOOK_SECRET` | سرّ توقيع الـ webhooks (أو `SHOPIFY_API_SECRET`) للتحقق من رسائل Shopify |
| `APP_BASE_URL` | رابط موقعك العام، لتسجيل عناوين الـ webhooks تلقائياً |
| `ORVANTA_TENANT_ID` | المستأجر (افتراضياً `golden-star`) الذي تُنسب إليه رسائل الـ webhook |

## كيفية الحصول على المفاتيح (Shopify Admin)

1. Shopify Admin → **Settings → Apps and sales channels → Develop apps**.
2. أنشئ تطبيقاً، وامنحه صلاحيات Admin API: `read_products`, `write_products`,
   وإن رغبت `read_orders`.
3. ثبّت التطبيق وانسخ **Admin API access token** → `SHOPIFY_ACCESS_TOKEN`.
4. سرّ التطبيق (**API secret key**) → `SHOPIFY_WEBHOOK_SECRET`.

## التفعيل

1. أضف المتغيرات أعلاه في Vercel → Settings → Environment Variables ثم أعد النشر.
2. من لوحة المتجر في مشروعك: زر **«تفعيل المزامنة التلقائية»** يسجّل الـ webhooks
   في Shopify (products/create, products/update, products/delete).
3. زر **«سحب منتجات المتجر»** يستورد كامل الكتالوج الحالي إلى المستودع مرة واحدة.

نقطة الوصول للـ webhook: `POST /api/shopify/webhook` — عامة عمداً في الـ proxy لأنها
تتحقق من توقيع Shopify بنفسها (HMAC-SHA256)، وهي المصادقة الصحيحة للـ webhook.
