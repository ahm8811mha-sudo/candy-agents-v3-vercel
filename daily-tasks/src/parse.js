/** استخراج حقول المعاملة من نص الـPDF بالاعتماد على المسميات العربية الشائعة. */

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeDigits(input) {
  return String(input || "").replace(/[٠-٩۰-۹]/g, (char) => {
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic > -1) return String(arabic);
    return String(EXTENDED_DIGITS.indexOf(char));
  });
}

export function clean(value) {
  return String(value || "")
    .replace(/[‏‎‪-‮]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * يبحث عن «المسمى : القيمة» ويقف عند نهاية السطر أو عند بداية مسمى آخر،
 * حتى لا تبتلع القيمة بقية الصفحة عندما يكون الـPDF مستخرجا كسطر واحد طويل.
 */
// المسميات التي توقف القيمة. تشمل الإنجليزية لأن كثيرا من ملفات الـPDF
// تستخرج كسطر واحد طويل، فبدونها تبتلع القيمة بقية الحقول.
const STOP_LABELS = [
  "اسم المريض", "المريض", "رقم الملف", "الملف الطبي", "السجل الطبي", "رقم السجل",
  "رقم المعاملة", "رقم المهمة", "رقم الطلب", "القسم", "العيادة", "الوحدة", "التخصص",
  "التشخيص", "الحالة", "الطبيب", "الطبيب المعالج", "الطبيب المحول",
  "الجهة", "الجهة المرسلة", "المستشفى", "المركز",
  "التاريخ", "تاريخ", "نوع الطلب", "الموضوع", "الملاحظات", "العمر", "الجنس",
  "Patient Name", "Patient", "File No", "File Number", "MRN", "Medical Record",
  "Task No", "Request No", "Request Type", "Department", "Clinic", "Unit",
  "Diagnosis", "Doctor", "Physician", "Subject", "Notes", "Date", "Age", "Gender", "From",
];

// الأطول أولا، حتى لا يقطع "Patient" ما يخص "Patient Name".
const STOP_PATTERN = [...STOP_LABELS]
  .sort((a, b) => b.length - a.length)
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");

function labelValue(text, labels) {
  const stop = STOP_PATTERN;
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `${escaped}\\s*[:：\\-]?\\s*([\\s\\S]{1,120}?)(?=\\s*(?:${stop})\\s*[:：]|\\n|$)`,
      "u"
    );
    const match = text.match(pattern);
    const value = clean(match?.[1]);
    if (value && value.length > 1) return value;
  }
  return "";
}

/** أرقام الملفات والمعاملات كلمة واحدة — نأخذ أول رمز فقط ونهمل ما بعده. */
function firstToken(value) {
  const normalized = normalizeDigits(clean(value));
  if (!normalized) return "";
  return normalized.match(/[\p{L}\d][\p{L}\d/-]*/u)?.[0] || normalized;
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

export function parsePdfFields(rawText) {
  const text = normalizeDigits(clean(rawText).replace(/ (?=[:：])/g, ""));
  if (!text) return {};

  const patientName = labelValue(text, ["اسم المريض", "أسم المريض", "المريض", "Patient Name", "Patient"]);
  const fileNumber =
    labelValue(text, ["رقم الملف", "رقم الملف الطبي", "الملف الطبي", "رقم السجل الطبي", "السجل الطبي", "File No", "MRN"]) ||
    firstMatch(text, [/\bMRN\s*[:：]?\s*(\d{4,12})/i]);

  const taskNumber = labelValue(text, ["رقم المعاملة", "رقم المهمة", "رقم الطلب", "رقم الصادر", "Task No", "Request No"]);
  const department = labelValue(text, ["القسم", "العيادة", "الوحدة", "التخصص", "Department", "Clinic"]);
  const doctor = labelValue(text, ["الطبيب المحول", "الطبيب المعالج", "الطبيب", "Doctor", "Physician"]);
  const diagnosis = labelValue(text, ["التشخيص", "الحالة", "Diagnosis"]);
  const requestType = labelValue(text, ["نوع الطلب", "الموضوع", "طلب", "Subject", "Request Type"]);
  const sender = labelValue(text, ["الجهة المرسلة", "الجهة", "المستشفى", "المركز", "From"]);

  const documentDate =
    firstMatch(text, [
      /(\d{4}[-/]\d{1,2}[-/]\d{1,2})/,
      /(\d{1,2}[-/]\d{1,2}[-/]\d{4})/,
    ]) || labelValue(text, ["التاريخ", "تاريخ التحويل", "تاريخ الطلب", "Date"]);

  return {
    patientName,
    fileNumber: firstToken(fileNumber),
    taskNumber: firstToken(taskNumber) || taskNumber,
    department,
    doctor,
    diagnosis,
    requestType,
    sender,
    documentDate: normalizeDate(documentDate),
    // ملخص مقروء عندما ينجح الاستخراج، وإلا مقتطف خام يساعد على المراجعة اليدوية.
    summary:
      patientName && fileNumber
        ? [requestType, diagnosis].filter(Boolean).join(" — ")
        : text.slice(0, 300),
  };
}

export function normalizeDate(value) {
  const raw = normalizeDigits(clean(value));
  if (!raw) return "";

  const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }

  const dmy = raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }

  return raw;
}

/** يدمج مصادر البيانات: الجدول أولا، ثم نص الـPDF، ثم تحليل الذكاء الاصطناعي. */
export function mergeSources({ row = {}, pdf = {}, ai = {} }) {
  const pick = (...values) => {
    for (const value of values) {
      const cleaned = clean(value);
      if (cleaned) return cleaned;
    }
    return "";
  };

  return {
    taskNumber: pick(row.taskNumber, pdf.taskNumber, ai.taskNumber),
    patientName: pick(row.patientName, pdf.patientName, ai.patientName),
    fileNumber: pick(row.fileNumber, pdf.fileNumber, ai.fileNumber),
    department: pick(pdf.department, ai.department, row.subject),
    doctor: pick(pdf.doctor, ai.referringDoctor),
    diagnosis: pick(pdf.diagnosis, ai.diagnosis),
    requestType: pick(row.subject, pdf.requestType, ai.requestType),
    sender: pick(row.sender, pdf.sender, ai.senderEntity),
    documentDate: normalizeDate(pick(pdf.documentDate, ai.documentDate, row.date)),
    summary: pick(ai.summary, pdf.summary),
  };
}
