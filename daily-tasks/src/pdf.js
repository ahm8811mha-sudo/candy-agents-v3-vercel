import fs from "node:fs";
import path from "node:path";
import { findFirst } from "./locate.js";

/** يحمل مرفق المعاملة ويعيد مساره على القرص، أو null إذا لم يوجد مرفق. */
export async function downloadTaskPdf(page, context, config, selectors, taskId, logger) {
  const found = await findFirst(page, selectors.taskDetail.pdfLink, { timeout: 6000 });
  if (!found) {
    logger.warn(`المهمة ${taskId}: لا يوجد مرفق PDF ظاهر في الصفحة.`);
    return null;
  }

  const safeId = String(taskId).replace(/[^\w؀-ۿ-]+/g, "_");
  const target = path.join(config.pdfDir, `${safeId}.pdf`);
  fs.mkdirSync(config.pdfDir, { recursive: true });

  // المسار الأول: الرابط يشير مباشرة إلى الملف — نجلبه بجلسة المتصفح نفسها (مع الكوكيز).
  const href = await found.locator.getAttribute("href").catch(() => null);
  if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
    const absolute = new URL(href, page.url()).toString();
    const response = await context.request.get(absolute).catch(() => null);
    if (response && response.ok()) {
      const body = await response.body();
      if (body.subarray(0, 4).toString("latin1") === "%PDF") {
        fs.writeFileSync(target, body);
        logger.info(`المهمة ${taskId}: تم تحميل المرفق (${body.length} بايت).`);
        return target;
      }
    }
  }

  // المسار الثاني: الضغط على الرابط يطلق تنزيلا.
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20_000 }),
      found.locator.click(),
    ]);
    await download.saveAs(target);
    logger.info(`المهمة ${taskId}: تم تحميل المرفق عبر التنزيل المباشر.`);
    return target;
  } catch (error) {
    logger.warn(`المهمة ${taskId}: تعذر تحميل المرفق — ${error.message}`);
    return null;
  }
}

/** يقرأ الطبقة النصية داخل الـPDF. يعيد نصا فارغا إذا كان الملف صورة ممسوحة ضوئيا. */
export async function extractPdfText(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const task = pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false });
  const doc = await task.promise;

  const pages = [];
  try {
    for (let index = 1; index <= doc.numPages; index += 1) {
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str).join(" "));
    }
  } finally {
    await task.destroy().catch(() => {});
  }

  return pages.join("\n").replace(/[ \t]+/g, " ").trim();
}

/**
 * احتياطي للـPDF الممسوح ضوئيا: يرسل الملف إلى OpenAI Responses API لاستخراج الحقول.
 * يستخدم نفس نمط التحليل المعتمد في lib/governmentRelationsV2.ts داخل المشروع.
 */
export async function extractPdfFieldsWithAi(filePath, config, logger) {
  if (!config.openaiKey) return null;

  const base64 = fs.readFileSync(filePath).toString("base64");
  const prompt = `أنت مساعد إداري في مستشفى. استخرج بيانات المعاملة الطبية من الملف المرفق وأعد JSON فقط بهذا الشكل بالضبط:
{"patientName":"","fileNumber":"","nationalIdPresent":false,"department":"","referringDoctor":"","diagnosis":"","requestType":"","senderEntity":"","documentDate":"","summary":""}
قواعد إلزامية:
- لا تستخرج ولا تعيد رقم الهوية الوطنية أو رقم الجوال أو أي بيانات دخول. إذا وجدت هوية اكتفِ بوضع nationalIdPresent=true.
- documentDate بصيغة YYYY-MM-DD إن وجد التاريخ، وإلا اتركه فارغا.
- department اكتب فيه القسم كما ورد حرفيا (مثل: العلاج الطبيعي، الجهاز الهضمي).
- summary سطر عربي واحد يلخص طلب المعاملة.
- أي حقل غير موجود اتركه نصا فارغا. لا تخمن.`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openaiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: path.basename(filePath),
                file_data: `data:application/pdf;base64,${base64}`,
              },
              { type: "input_text", text: prompt },
            ],
          },
        ],
        temperature: 0,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    }

    const text =
      payload.output_text ||
      payload.output?.flatMap((item) => item.content || []).map((part) => part.text).filter(Boolean).join("") ||
      "";

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch (error) {
    logger.warn(`تحليل الـPDF بالذكاء الاصطناعي فشل: ${error.message}`);
    return null;
  }
}
