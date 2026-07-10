# Google Workspace — التكامل الفعلي مع Orvanta

يحوّل هذا التكامل عناصر `Action Queue` من حالة `WAITING_INTEGRATION` إلى آثار خارجية حقيقية ومحكومة:

| Action type | التنفيذ |
|---|---|
| `SALES_OUTREACH` / `EMAIL_DRAFT` | إنشاء مسودة Gmail للمراجعة |
| `EMAIL_SEND` | إرسال Gmail بعد وجود مستلم واعتماد الإجراء |
| `SUPPLIER_SHORTLIST` / `SHEETS_APPEND` | إضافة سجل إلى Google Sheets |
| `MARKETING_CAMPAIGN_DRAFT` / `DRIVE_UPLOAD` | إنشاء ملف فعلي في Google Drive |

> تجهيز حملة داخل Drive لا يعني إطلاق إعلان مدفوع. إطلاق Google Ads أو Meta Ads يحتاج موصلًا مستقلاً وبوابة اعتماد مالية.

## 1. إعداد Google Cloud

1. أنشئ أو اختر Google Cloud Project.
2. فعّل:
   - Gmail API
   - Google Sheets API
   - Google Drive API
3. اضبط OAuth Consent Screen.
4. أنشئ OAuth Client من نوع **Desktop app** للاستخدام مع أداة الإعداد المحلية.
5. أضف Redirect URI التالي عند الحاجة:

```txt
http://127.0.0.1:53682/oauth2callback
```

الحساب الذي يمنح الصلاحية هو الحساب الذي ستظهر فيه مسودات Gmail وملفات Drive وSheets.

## 2. استخراج Refresh Token

لا ترفع أي سر إلى GitHub.

شغّل محليًا:

```bash
GOOGLE_CLIENT_ID="..." \
GOOGLE_CLIENT_SECRET="..." \
npm run google:oauth
```

افتح الرابط الذي يظهر، وافق على الصلاحيات، ثم انسخ `GOOGLE_REFRESH_TOKEN` مباشرة إلى Vercel Environment Variables.

الصلاحيات المطلوبة:

```txt
https://www.googleapis.com/auth/gmail.compose
https://www.googleapis.com/auth/spreadsheets
https://www.googleapis.com/auth/drive.file
```

## 3. متغيرات Vercel

إلزامية:

```env
GOOGLE_INTEGRATIONS_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
```

اختيارية:

```env
GOOGLE_GMAIL_SENDER=owner@example.com
GOOGLE_DEFAULT_REVIEW_EMAIL=owner@example.com
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_NAME=Orvanta Action Queue
GOOGLE_SHEETS_TAB=Actions
GOOGLE_DRIVE_FOLDER_ID=
```

إذا لم تضبط `GOOGLE_SHEETS_SPREADSHEET_ID`، يبحث النظام عن ملف باسم `Orvanta Action Queue` ثم ينشئه تلقائيًا إذا لم يجده.

إذا لم تضبط `GOOGLE_DRIVE_FOLDER_ID`، تُنشأ الملفات في My Drive للحساب المصرح.

## 4. الحوكمة ومنع التكرار

- لا ينفذ الإجراء الخارجي إذا كان ينتظر اعتمادًا.
- يتم حجز الإجراء ذريًا قبل التنفيذ، لمنع ضغطتين متزامنتين من تكرار الأثر الخارجي.
- Gmail يستخدم `Message-ID` ثابتًا مرتبطًا بمعرف الإجراء.
- Drive يستخدم `appProperties.orvantaActionId` للبحث عن الملف المنفذ سابقًا.
- Sheets يبحث عن `Action ID` قبل إضافة صف جديد.
- الأخطاء المؤقتة مثل `429` و`5xx` يعاد تنفيذها تلقائيًا بعد تأخير محدود.
- نتيجة التنفيذ تحفظ داخل `business_actions.result`، والخطأ داخل `business_actions.error`.

## 5. الاختبار بعد النشر

1. افتح `/api/integrations/status` وتأكد من:

```json
{
  "googleWorkspace": {
    "enabled": true,
    "credentialsConfigured": true
  }
}
```

2. اعتمد فكرة حتى تظهر أفعال في `Action Queue`.
3. نفذ `SALES_OUTREACH` وتأكد من ظهور مسودة في Gmail.
4. نفذ `SUPPLIER_SHORTLIST` وتأكد من ظهور صف واحد فقط في Sheets.
5. أعد تنفيذ نفس الإجراء وتأكد من عدم إنشاء نسخة ثانية.
6. نفذ `MARKETING_CAMPAIGN_DRAFT` وتأكد من ظهور ملف في Drive.
7. راجع `Audit Log` وحقول `attempts`, `result`, `error`.

## 6. نقاط الأمان

- لا تستخدم Service Account لإرسال Gmail شخصي؛ هذا المسار مبني على OAuth Refresh Token للحساب المصرح.
- لا تضع Refresh Token في `NEXT_PUBLIC_*`.
- لا تعرض قيمة أي سر عبر API أو واجهة المستخدم.
- اترك `GOOGLE_INTEGRATIONS_ENABLED=false` إلى أن تنتهي من إعداد الحساب واختباره.
- إرسال البريد الفعلي يستخدم `EMAIL_SEND` فقط، بينما `SALES_OUTREACH` ينشئ مسودة آمنة للمراجعة.
