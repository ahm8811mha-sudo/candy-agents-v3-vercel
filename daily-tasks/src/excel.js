import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

export const COLUMNS = [
  { header: "م", key: "serial", width: 6 },
  { header: "رقم المهمة", key: "taskNumber", width: 16 },
  { header: "اسم المريض", key: "patientName", width: 30 },
  { header: "رقم الملف", key: "fileNumber", width: 16 },
  { header: "القسم", key: "department", width: 18 },
  { header: "نوع الطلب / الموضوع", key: "requestType", width: 26 },
  { header: "التشخيص", key: "diagnosis", width: 26 },
  { header: "الطبيب المحول", key: "doctor", width: 22 },
  { header: "الجهة المرسلة", key: "sender", width: 22 },
  { header: "تاريخ المعاملة", key: "documentDate", width: 14 },
  { header: "الملخص", key: "summary", width: 44 },
  { header: "حالة المعاملة", key: "status", width: 16 },
  { header: "مصدر البيانات", key: "source", width: 18 },
  { header: "وقت التسجيل", key: "recordedAt", width: 12 },
  { header: "رابط المهمة", key: "taskUrl", width: 40 },
  { header: "ملف الـPDF", key: "pdfPath", width: 28 },
];

const HEADER_FILL = "FF1F3B4D";
const NEEDS_REVIEW_FILL = "FFFFF3CD";

async function openWorkbook(filePath) {
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(filePath)) {
    await workbook.xlsx.readFile(filePath);
  } else {
    workbook.creator = "daily-tasks-runner";
  }
  workbook.modified = new Date();
  return workbook;
}

/** شريحة مستقلة لكل يوم، فتبقى مهام الأربعاء منفصلة تماما عن مهام الثلاثاء. */
function getDaySheet(workbook, dayKey) {
  const existing = workbook.getWorksheet(dayKey);
  if (existing) return existing;

  const sheet = workbook.addWorksheet(dayKey, {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });

  sheet.columns = COLUMNS.map(({ header, key, width }) => ({ header, key, width }));

  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = { bottom: { style: "thin", color: { argb: "FF0F2430" } } };
  });

  sheet.autoFilter = { from: "A1", to: { row: 1, column: COLUMNS.length } };
  return sheet;
}

/** أرقام المهام الموجودة أصلا في الملف، لمنع تكرار نفس المعاملة عند إعادة التشغيل. */
export async function existingTaskNumbers(filePath) {
  if (!fs.existsSync(filePath)) return new Set();

  const workbook = await openWorkbook(filePath);
  const taskColumn = COLUMNS.findIndex((column) => column.key === "taskNumber") + 1;
  const seen = new Set();

  workbook.eachSheet((sheet) => {
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const value = row.getCell(taskColumn).value;
      const text = String(value?.text ?? value ?? "").trim();
      if (text) seen.add(text);
    });
  });

  return seen;
}

export async function appendRows(filePath, dayKey, records) {
  if (!records.length) return { added: 0, sheet: dayKey };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const workbook = await openWorkbook(filePath);
  const sheet = getDaySheet(workbook, dayKey);

  let serial = sheet.rowCount > 1 ? sheet.rowCount - 1 : 0;

  for (const record of records) {
    serial += 1;
    const row = sheet.addRow({ ...record, serial });
    row.alignment = { vertical: "middle", horizontal: "right", wrapText: true };

    // تمييز الصفوف الناقصة بلون، حتى تعرف بنظرة واحدة ما يحتاج مراجعة يدوية.
    const incomplete = !record.patientName || !record.fileNumber;
    if (incomplete) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NEEDS_REVIEW_FILL } };
      });
    }
  }

  await workbook.xlsx.writeFile(filePath);
  return { added: records.length, sheet: dayKey };
}

/**
 * يحدث خانة «حالة المعاملة» بعد تنفيذ خطوة "تحت التنفيذ" على النظام،
 * فيبقى الإكسل معبرا عن الحالة الفعلية لا عن النية فقط.
 */
export async function updateStatuses(filePath, dayKey, statusByTaskNumber) {
  const entries = Object.entries(statusByTaskNumber);
  if (!fs.existsSync(filePath) || !entries.length) return 0;

  const workbook = await openWorkbook(filePath);
  const sheet = workbook.getWorksheet(dayKey);
  if (!sheet) return 0;

  const taskColumn = COLUMNS.findIndex((column) => column.key === "taskNumber") + 1;
  const statusColumn = COLUMNS.findIndex((column) => column.key === "status") + 1;
  let updated = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = row.getCell(taskColumn).value;
    const taskNumber = String(cell?.text ?? cell ?? "").trim();
    if (taskNumber && statusByTaskNumber[taskNumber]) {
      row.getCell(statusColumn).value = statusByTaskNumber[taskNumber];
      updated += 1;
    }
  });

  if (updated) await workbook.xlsx.writeFile(filePath);
  return updated;
}
