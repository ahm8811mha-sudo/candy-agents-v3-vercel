# Orvanta Public API v1

واجهة برمجية خارجية بمعيار Stripe: مفتاح واحد، ردود JSON متسقة، وتدهور صريح.

## التفعيل
أضف في Vercel → Environment Variables:

```env
ORVANTA_API_KEY=<مفتاح قوي تولّده أنت>
# اختياري — أحداث صادرة:
ORVANTA_WEBHOOK_URL=https://your-server.example/webhooks/orvanta
ORVANTA_WEBHOOK_SECRET=<سر التوقيع>   # وإلا يُستخدم API_SECRET_KEY
```

بدون `ORVANTA_API_KEY` ترجع كل المسارات `503` برسالة واضحة (غير مفعّلة — وليست مفتوحة).

## المصادقة
```http
Authorization: Bearer <ORVANTA_API_KEY>
```

## المسارات

| Method | Path | الوصف |
|---|---|---|
| GET | `/api/public/v1/status` | ملخص المنصة: إحصاءات الأفكار والاعتمادات وحالة الديمومة |
| GET | `/api/public/v1/ideas` | لوحة الأفكار كاملة مع الدراسات والتوصيات |
| POST | `/api/public/v1/ideas` | تقديم فكرة تدخل خط الجدوى المحوكم (لا تتجاوز مصفوفة الصلاحيات أبداً) |
| GET | `/api/public/v1/decisions` | قائمة القرارات المعلّقة مع قياسات SLA (`ageHours`, `stale`) |

### مثال — تقديم فكرة
```bash
curl -X POST https://<your-app>/api/public/v1/ideas \
  -H "Authorization: Bearer $ORVANTA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"حملة رمضان","hypothesis":"الطلب الموسمي يرتفع 40%","budgetSAR":18000,"horizonDays":30}'
```
الفكرة تُدرس تلقائياً من ثلاثة وكلاء وتُرفع لمركز القرار — الـ API لا يملك صلاحية الاعتماد.

## Webhooks الصادرة

عند ضبط `ORVANTA_WEBHOOK_URL` تُرسل هذه الأحداث `POST` بتوقيع
`X-Orvanta-Signature` = HMAC-SHA256(hex) لجسم الطلب:

| الحدث | متى |
|---|---|
| `idea.submitted` | فكرة جديدة دخلت الخط (مالك/فريق/API) |
| `approval.created` | عنصر جديد وصل مركز القرار |
| `approval.decided` | المالك اعتمد أو رفض |
| `income.recognized` | مداخيل رُحّلت للدفتر وصدرت فاتورتها |

### التحقق من التوقيع (Node)
```js
const crypto = require("crypto");
const expected = crypto.createHmac("sha256", process.env.ORVANTA_WEBHOOK_SECRET)
  .update(rawBody, "utf8").digest("hex");
const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
```
