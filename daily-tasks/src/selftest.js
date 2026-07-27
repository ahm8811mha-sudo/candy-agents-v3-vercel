import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import { parsePdfFields, mergeSources, normalizeDate, normalizeDigits } from "./parse.js";
import { classify, categoryLabel, PHYSIO, GASTRO, UNKNOWN } from "./classify.js";
import { appendRows, existingTaskNumbers, updateStatuses, COLUMNS } from "./excel.js";
import { extractPdfText } from "./pdf.js";
import { loadSelectors } from "./config.js";

/**
 * فحص ذاتي بلا اتصال بالنظام: يتأكد أن الاستخراج والتصنيف وكتابة الإكسل
 * وقراءة الـPDF تعمل على هذا الجهاز قبل تشغيل الأتمتة الحقيقية.
 */

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push({ name, ok: true }))
    .catch((error) => results.push({ name, ok: false, error: error.message }));
}

/** يبني ملف PDF صغير صالح بطبقة نصية، لاختبار مسار القراءة فعليا. */
function buildSamplePdf(target, line) {
  const content = `BT /F1 12 Tf 60 720 Td (${line.replace(/([()\\])/g, "\\$1")}) Tj ET`;
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    `<</Length ${Buffer.byteLength(content)}>>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF`;

  fs.writeFileSync(target, pdf, "latin1");
  return target;
}

const SAMPLE = `مستشفى الملك فهد
رقم المعاملة : 44120
اسم المريض : أحمد محمد العتيبي
رقم الملف : ٧٨٩٤٥٦
القسم : العلاج الطبيعي
الطبيب المحول : د. سارة القحطاني
التشخيص : آلام أسفل الظهر مع ضعف في عضلات الطرف السفلي
نوع الطلب : تحويل لجلسات علاج طبيعي
التاريخ : 2026-07-27`;

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-tasks-selftest-"));
  const selectors = loadSelectors();

  await check("استخراج الحقول من نص عربي", () => {
    const fields = parsePdfFields(SAMPLE);
    assert.equal(fields.patientName, "أحمد محمد العتيبي");
    assert.equal(fields.fileNumber, "789456", `رقم الملف المستخرج: ${fields.fileNumber}`);
    assert.equal(fields.taskNumber, "44120");
    assert.equal(fields.department, "العلاج الطبيعي");
    assert.equal(fields.documentDate, "2026-07-27");
  });

  await check("PDF مستخرج كسطر واحد لا تبتلع فيه القيمة بقية الحقول", () => {
    const oneLine = "Task No: 44120 Patient Name: Ahmed Al Otaibi File No: 789456 Department: Physiotherapy Diagnosis: Lower back pain Date: 2026-07-27";
    const fields = parsePdfFields(oneLine);
    assert.equal(fields.patientName, "Ahmed Al Otaibi", `الاسم المستخرج: ${fields.patientName}`);
    assert.equal(fields.fileNumber, "789456", `رقم الملف المستخرج: ${fields.fileNumber}`);
    assert.equal(fields.taskNumber, "44120", `رقم المهمة المستخرج: ${fields.taskNumber}`);
    assert.equal(fields.department, "Physiotherapy", `القسم المستخرج: ${fields.department}`);
    assert.equal(fields.documentDate, "2026-07-27");
  });

  await check("تحويل الأرقام العربية والتواريخ", () => {
    assert.equal(normalizeDigits("١٢٣٤"), "1234");
    assert.equal(normalizeDate("27/07/2026"), "2026-07-27");
    assert.equal(normalizeDate("2026/7/5"), "2026-07-05");
  });

  await check("تصنيف مريض علاج طبيعي", () => {
    const fields = parsePdfFields(SAMPLE);
    const verdict = classify(fields, SAMPLE, selectors.classification);
    assert.equal(verdict.category, PHYSIO, `صنف كـ${verdict.category}`);
  });

  await check("تصنيف مريض جهاز هضمي", () => {
    const text = "القسم : الجهاز الهضمي\nنوع الطلب : منظار قولون تشخيصي";
    const fields = parsePdfFields(text);
    const verdict = classify(fields, text, selectors.classification);
    assert.equal(verdict.category, GASTRO, `صنف كـ${verdict.category}`);
  });

  await check("المعاملة الغامضة تذهب لملف غير مصنف", () => {
    const text = "طلب صرف مستلزمات مكتبية";
    const verdict = classify(parsePdfFields(text), text, selectors.classification);
    assert.equal(verdict.category, UNKNOWN);
    assert.equal(categoryLabel(verdict.category), "غير مصنف");
  });

  await check("أولوية المصادر: الجدول ثم PDF ثم الذكاء الاصطناعي", () => {
    const merged = mergeSources({
      row: { taskNumber: "9001", patientName: "" },
      pdf: { patientName: "نورة السالم", fileNumber: "" },
      ai: { fileNumber: "112233", summary: "تحويل لجلسة تأهيل" },
    });
    assert.equal(merged.taskNumber, "9001");
    assert.equal(merged.patientName, "نورة السالم");
    assert.equal(merged.fileNumber, "112233");
    assert.equal(merged.summary, "تحويل لجلسة تأهيل");
  });

  await check("قراءة نص من ملف PDF حقيقي", async () => {
    const file = buildSamplePdf(path.join(temp, "sample.pdf"), "File No: 445566 Patient: Ahmed");
    const text = await extractPdfText(file);
    assert.ok(text.includes("445566"), `النص المستخرج: ${text}`);
  });

  await check("كتابة الإكسل بشريحة يومية وعدم تكرار المعاملات", async () => {
    const file = path.join(temp, "physio.xlsx");
    const row = {
      taskNumber: "44120",
      patientName: "أحمد محمد العتيبي",
      fileNumber: "789456",
      department: "العلاج الطبيعي",
      status: "مسجلة - بانتظار التنفيذ",
    };

    await appendRows(file, "2026-07-27", [row]);
    await appendRows(file, "2026-07-28", [{ ...row, taskNumber: "44121" }]);

    const seen = await existingTaskNumbers(file);
    assert.ok(seen.has("44120") && seen.has("44121"), "لم تقرأ أرقام المهام المسجلة");

    const updated = await updateStatuses(file, "2026-07-27", { 44120: "تحت التنفيذ" });
    assert.equal(updated, 1, "لم تحدث حالة المعاملة");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file);

    assert.deepEqual(
      workbook.worksheets.map((sheet) => sheet.name),
      ["2026-07-27", "2026-07-28"],
      "الشرائح اليومية غير صحيحة"
    );

    const sheet = workbook.getWorksheet("2026-07-27");
    assert.equal(sheet.getRow(1).getCell(1).value, COLUMNS[0].header);
    assert.equal(sheet.views[0].rightToLeft, true, "الشريحة ليست بترتيب من اليمين لليسار");

    const statusColumn = COLUMNS.findIndex((column) => column.key === "status") + 1;
    assert.equal(sheet.getRow(2).getCell(statusColumn).value, "تحت التنفيذ");
  });

  fs.rmSync(temp, { recursive: true, force: true });

  const failed = results.filter((item) => !item.ok);
  for (const item of results) {
    console.log(`${item.ok ? "✔" : "✘"}  ${item.name}${item.ok ? "" : `\n    ${item.error}`}`);
  }
  console.log(`\n${results.length - failed.length}/${results.length} فحص ناجح.`);

  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
