import { evaluateGovernedAction, logDecision, seedGovernanceOS } from "./governanceOS";
import { getSupabaseAdmin } from "./supabase";
import { createHash } from "node:crypto";
import { toLegacyDecisionAuditRow } from "./company/audit";

type GovernmentDocumentInput = {
  documentId?: string;
  documentType?: string;
  title?: string;
  issuer?: string;
  documentNumber?: string;
  ownerName?: string;
  taxNumber?: string;
  startDate?: string;
  expiryDate?: string;
  renewalDate?: string;
  city?: string;
  activity?: string;
  changeReason?: string;
  actorRole?: string;
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  fileText?: string;
  notes?: string;
  category?: string;
};

type RegulatorySourceInput = {
  id?: string;
  documentType: string;
  issuer: string;
  title: string;
  officialUrl: string;
  sourceKind?: string;
};

type FeeSourceInput = {
  documentType: string;
  issuer: string;
  serviceName: string;
  officialUrl: string;
  renewalUrl: string;
  feeAmount?: number | null;
  feeCurrency?: string;
  feeText: string;
  sourceConfidence?: string;
};

type ExtractedGovernmentData = {
  documentType: string;
  documentNumber?: string;
  title?: string;
  issuer?: string;
  ownerName?: string;
  startDate?: string;
  expiryDate?: string;
  renewalDate?: string;
  city?: string;
  activity?: string;
  taxNumber?: string;
  confidence: number;
  missingFields: string[];
  summary: string;
};

const catalog: FeeSourceInput[] = [
  {
    documentType: "COMMERCIAL_REGISTRATION",
    issuer: "Saudi Business Center / Ministry of Commerce",
    serviceName: "Commercial registration services",
    officialUrl: "https://business.sa/en/servicesprocedures/details/3f37df76-a853-4616-ef34-08dced12ee80",
    renewalUrl: "https://business.sa",
    feeText: "Official portal fee should be checked before renewal because commercial registration cost can depend on entity and selected period.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
  {
    documentType: "VAT_CERTIFICATE",
    issuer: "Zakat, Tax and Customs Authority",
    serviceName: "VAT certificate and registration",
    officialUrl: "https://zatca.gov.sa/en/eServices/Pages/eServices-001.aspx",
    renewalUrl: "https://login.zatca.gov.sa/irj/portal",
    feeAmount: 0,
    feeCurrency: "SAR",
    feeText: "VAT registration/certificate services are handled through ZATCA. Reprint VAT certificate pages indicate no service fee; tax obligations remain separate.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
  {
    documentType: "ZAKAT_TAX_CERTIFICATE",
    issuer: "Zakat, Tax and Customs Authority",
    serviceName: "Tax certificate and taxpayer services",
    officialUrl: "https://zatca.gov.sa/en/eServices/Pages/default.aspx",
    renewalUrl: "https://login.zatca.gov.sa/irj/portal",
    feeText: "Fees and obligations depend on taxpayer status and filings. The system should verify the official ZATCA service before any submission.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
  {
    documentType: "CHAMBER_SUBSCRIPTION",
    issuer: "Saudi Business Center / Chambers of Commerce",
    serviceName: "Renewal of Chamber of Commerce subscription",
    officialUrl: "https://business.sa/en/eservices/details/e95ddf0f-41c3-4a72-d307-08dd92bf74b8",
    renewalUrl: "https://business.sa",
    feeText: "Chamber subscription renewal depends on the establishment and chamber classification. Verify fee from the official portal invoice.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
  {
    documentType: "MUNICIPAL_LICENSE",
    issuer: "Balady Platform",
    serviceName: "Renewing a commercial license",
    officialUrl: "https://balady.gov.sa/en/services/renewing-commercial-license",
    renewalUrl: "https://balady.gov.sa",
    feeText: "Municipal license fees depend on activity, location, area, and municipality rules. The official Balady portal must calculate the final invoice.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
  {
    documentType: "WORK_PERMIT",
    issuer: "Qiwa",
    serviceName: "Work permit calculator and renewal",
    officialUrl: "https://www.qiwa.sa/en/tools-and-calculators/work-permit-calculator",
    renewalUrl: "https://qiwa.sa/en/business-owners/manage-current-employees/how-renew-work-permits",
    feeText: "Qiwa provides an official work permit calculator. Fees vary by establishment and employee conditions.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
  {
    documentType: "INVESTMENT_LICENSE",
    issuer: "Ministry of Investment",
    serviceName: "Investor services and investment license",
    officialUrl: "https://misa.gov.sa/activities/e-services/",
    renewalUrl: "https://misa.gov.sa/activities/e-services/",
    feeText: "Investment license fees and renewal requirements must be verified from the MISA portal and the investor account.",
    sourceConfidence: "OFFICIAL_SOURCE",
  },
];

const portalIntegrations = [
  { id: "gov-business-sa", provider: "Saudi Business Center", status: "READY_FOR_CONNECTION", config: { scope: "commercial_registration,chamber_subscription" } },
  { id: "gov-zatca", provider: "ZATCA", status: "READY_FOR_CONNECTION", config: { scope: "vat,zakat,tax_certificates" } },
  { id: "gov-balady", provider: "Balady", status: "READY_FOR_CONNECTION", config: { scope: "municipal_licenses" } },
  { id: "gov-qiwa", provider: "Qiwa", status: "READY_FOR_CONNECTION", config: { scope: "work_permits" } },
  { id: "gov-misa", provider: "MISA", status: "READY_FOR_CONNECTION", config: { scope: "investment_license" } },
  { id: "gov-nafath", provider: "National Single Sign-On / Nafath", status: "REQUIRED_FOR_AUTOMATION", config: { scope: "authorized_government_portal_login" } },
];

const regulatorySources: RegulatorySourceInput[] = [
  {
    id: "reg-commercial-registration",
    documentType: "COMMERCIAL_REGISTRATION",
    issuer: "Saudi Business Center / Ministry of Commerce",
    title: "متطلبات وخدمات السجل التجاري",
    officialUrl: "https://business.sa/ar/servicesprocedures/details/3f37df76-a853-4616-ef34-08dced12ee80",
  },
  {
    id: "reg-vat",
    documentType: "VAT_CERTIFICATE",
    issuer: "Zakat, Tax and Customs Authority",
    title: "أنظمة ولوائح ضريبة القيمة المضافة",
    officialUrl: "https://zatca.gov.sa/ar/RulesRegulations/Taxes/Pages/default.aspx",
    sourceKind: "REGULATIONS",
  },
  {
    id: "reg-zakat-tax",
    documentType: "ZAKAT_TAX_CERTIFICATE",
    issuer: "Zakat, Tax and Customs Authority",
    title: "الأنظمة واللوائح الزكوية والضريبية",
    officialUrl: "https://zatca.gov.sa/ar/RulesRegulations/Taxes/Pages/default.aspx",
    sourceKind: "REGULATIONS",
  },
  {
    id: "reg-chamber",
    documentType: "CHAMBER_SUBSCRIPTION",
    issuer: "Saudi Business Center / Chambers of Commerce",
    title: "متطلبات تجديد اشتراك الغرفة التجارية",
    officialUrl: "https://business.sa/en/eservices/details/e95ddf0f-41c3-4a72-d307-08dd92bf74b8",
  },
  {
    id: "reg-municipal-license",
    documentType: "MUNICIPAL_LICENSE",
    issuer: "Balady Platform",
    title: "متطلبات تجديد الرخصة التجارية",
    officialUrl: "https://balady.gov.sa/en/services/renewing-commercial-license",
  },
  {
    id: "reg-work-permit",
    documentType: "WORK_PERMIT",
    issuer: "Qiwa",
    title: "متطلبات ورسوم تجديد رخص العمل",
    officialUrl: "https://www.qiwa.sa/en/tools-and-calculators/work-permit-calculator",
  },
  {
    id: "reg-investment-license",
    documentType: "INVESTMENT_LICENSE",
    issuer: "Ministry of Investment",
    title: "متطلبات خدمات وترخيص المستثمر",
    officialUrl: "https://misa.gov.sa/activities/e-services/",
  },
];

const requiredFieldsByType: Record<string, string[]> = {
  COMMERCIAL_REGISTRATION: ["documentNumber", "issuer", "startDate", "expiryDate", "ownerName"],
  VAT_CERTIFICATE: ["taxNumber", "issuer", "startDate", "ownerName"],
  ZAKAT_TAX_CERTIFICATE: ["documentNumber", "issuer", "expiryDate", "ownerName"],
  CHAMBER_SUBSCRIPTION: ["documentNumber", "issuer", "expiryDate", "ownerName"],
  MUNICIPAL_LICENSE: ["documentNumber", "issuer", "expiryDate", "city", "activity"],
  WORK_PERMIT: ["documentNumber", "issuer", "expiryDate", "ownerName"],
  INVESTMENT_LICENSE: ["documentNumber", "issuer", "startDate", "expiryDate", "ownerName"],
  OTHER_GOVERNMENT_DOCUMENT: ["documentNumber", "issuer", "expiryDate"],
};

const knownDocumentTypes = new Set(Object.keys(requiredFieldsByType));

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sourceId(input: RegulatorySourceInput) {
  if (input.id) return input.id;
  const slug = `${input.documentType}-${input.issuer}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
  return `reg-${slug || Date.now()}`;
}

function requireOfficialUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Official source URL must use HTTPS.");
  const host = url.hostname.toLowerCase();
  const trustedHost = host.endsWith(".gov.sa") || host === "gov.sa" ||
    host === "business.sa" || host.endsWith(".business.sa") ||
    host === "qiwa.sa" || host.endsWith(".qiwa.sa");
  if (!trustedHost) throw new Error("استخدم رابطًا رسميًا تابعًا لجهة حكومية سعودية أو منصة حكومية معتمدة.");
  return url.toString();
}

function contentHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizedOfficialText(value: string) {
  return value
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function storagePathFor(documentId: string, fileName?: string) {
  const safeName = (fileName || "government-document").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "");
  return `${documentId}/${Date.now()}-${safeName || "document"}`;
}

function documentSnapshot(document: Record<string, unknown>) {
  const fields = [
    "id",
    "document_type",
    "title",
    "document_number",
    "issuer",
    "owner_name",
    "tax_number",
    "start_date",
    "expiry_date",
    "renewal_date",
    "city",
    "activity",
    "status",
    "official_url",
    "renewal_url",
    "fee_amount",
    "fee_currency",
    "fee_text",
    "missing_fields",
    "extraction_confidence",
    "notes",
    "revision_no",
    "regulatory_status",
  ];
  return Object.fromEntries(fields.map((field) => [field, document[field] ?? null]));
}

function base64ToBuffer(value: string) {
  return Buffer.from(value, "base64");
}

function dateOnly(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function documentStatus(expiryDate?: string | null) {
  const remaining = daysUntil(expiryDate);
  if (remaining === null) return "NEEDS_REVIEW";
  if (remaining < 0) return "EXPIRED";
  if (remaining <= 30) return "RENEWAL_URGENT";
  if (remaining <= 90) return "RENEWAL_SOON";
  return "ACTIVE";
}

function renewalDateFor(expiryDate?: string | null) {
  if (!expiryDate) return null;
  const date = new Date(expiryDate);
  if (!Number.isFinite(date.getTime())) return null;
  date.setDate(date.getDate() - 45);
  return date.toISOString().slice(0, 10);
}

function detectDocumentType(input: GovernmentDocumentInput, text = "") {
  if (input.documentType && knownDocumentTypes.has(input.documentType)) return input.documentType;
  const haystack = `${input.documentType || ""} ${input.title || ""} ${input.fileName || ""} ${input.notes || ""} ${text}`.toLowerCase();
  if (haystack.includes("commercial_registration")) return "COMMERCIAL_REGISTRATION";
  if (haystack.includes("vat_certificate")) return "VAT_CERTIFICATE";
  if (haystack.includes("zakat_tax_certificate")) return "ZAKAT_TAX_CERTIFICATE";
  if (haystack.includes("chamber_subscription")) return "CHAMBER_SUBSCRIPTION";
  if (haystack.includes("municipal_license")) return "MUNICIPAL_LICENSE";
  if (haystack.includes("work_permit")) return "WORK_PERMIT";
  if (haystack.includes("investment_license")) return "INVESTMENT_LICENSE";
  if (haystack.includes("commercial registration") || haystack.includes("commercial register") || haystack.includes("سجل تجاري") || haystack.includes("السجل التجاري")) return "COMMERCIAL_REGISTRATION";
  if (haystack.includes("vat") || haystack.includes("value added") || haystack.includes("ضريبة القيمة") || haystack.includes("الرقم الضريبي")) return "VAT_CERTIFICATE";
  if (haystack.includes("zakat") || haystack.includes("زكاة") || haystack.includes("زكوي")) return "ZAKAT_TAX_CERTIFICATE";
  if (haystack.includes("chamber") || haystack.includes("الغرفة") || haystack.includes("اشتراك")) return "CHAMBER_SUBSCRIPTION";
  if (haystack.includes("balady") || haystack.includes("municipal") || haystack.includes("رخصة بلدية") || haystack.includes("بلدي")) return "MUNICIPAL_LICENSE";
  if (haystack.includes("qiwa") || haystack.includes("work permit") || haystack.includes("رخصة عمل")) return "WORK_PERMIT";
  if (haystack.includes("misa") || haystack.includes("investment license") || haystack.includes("ترخيص استثمار")) return "INVESTMENT_LICENSE";
  return "OTHER_GOVERNMENT_DOCUMENT";
}

function matchFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function fallbackExtraction(input: GovernmentDocumentInput): ExtractedGovernmentData {
  const text = `${input.fileText || ""}\n${input.notes || ""}\n${input.fileName || ""}`;
  const documentType = detectDocumentType(input, text);
  const documentNumber = matchFirst(text, [
    /(?:رقم السجل|السجل التجاري|commercial registration|commercial register|cr no\.?|document number|license no\.?)\s*[:\-]?\s*([0-9A-Za-z\-\/]+)/i,
    /(?:vat|tax number|الرقم الضريبي)\s*[:\-]?\s*([0-9A-Za-z\-\/]+)/i,
  ]);
  const startDate = matchFirst(text, [
    /(?:تاريخ الإصدار|issue date|start date|valid from)\s*[:\-]?\s*([0-9]{4}[-\/][0-9]{1,2}[-\/][0-9]{1,2})/i,
    /(?:تاريخ البداية)\s*[:\-]?\s*([0-9]{4}[-\/][0-9]{1,2}[-\/][0-9]{1,2})/i,
  ]);
  const expiryDate = matchFirst(text, [
    /(?:تاريخ الانتهاء|expiry date|valid until|expiration)\s*[:\-]?\s*([0-9]{4}[-\/][0-9]{1,2}[-\/][0-9]{1,2})/i,
    /(?:ينتهي في)\s*[:\-]?\s*([0-9]{4}[-\/][0-9]{1,2}[-\/][0-9]{1,2})/i,
  ]);
  const taxNumber = matchFirst(text, [/(?:tax number|vat number|الرقم الضريبي)\s*[:\-]?\s*([0-9A-Za-z\-\/]+)/i]);
  const issuer = input.issuer || catalog.find((item) => item.documentType === documentType)?.issuer || "";
  const required = requiredFieldsByType[documentType] || requiredFieldsByType.OTHER_GOVERNMENT_DOCUMENT;
  const extracted: ExtractedGovernmentData = {
    documentType,
    documentNumber,
    title: input.title || titleForDocumentType(documentType),
    issuer,
    ownerName: "",
    startDate: dateOnly(startDate) || undefined,
    expiryDate: dateOnly(expiryDate) || undefined,
    renewalDate: renewalDateFor(dateOnly(expiryDate)) || undefined,
    taxNumber,
    confidence: documentNumber || expiryDate || taxNumber ? 0.55 : 0.25,
    missingFields: [],
    summary: "تم حفظ الوثيقة. يحتاج الاستخراج إلى مراجعة إذا كانت الصورة أو PDF غير قابلة للقراءة النصية.",
  };

  extracted.missingFields = required.filter((field) => !cleanText((extracted as Record<string, unknown>)[field]));
  return extracted;
}

function titleForDocumentType(type: string) {
  const titles: Record<string, string> = {
    COMMERCIAL_REGISTRATION: "السجل التجاري",
    VAT_CERTIFICATE: "شهادة ضريبة القيمة المضافة",
    ZAKAT_TAX_CERTIFICATE: "شهادة الزكاة والضريبة",
    CHAMBER_SUBSCRIPTION: "اشتراك الغرفة التجارية",
    MUNICIPAL_LICENSE: "الرخصة البلدية",
    WORK_PERMIT: "رخصة العمل",
    INVESTMENT_LICENSE: "ترخيص الاستثمار",
    OTHER_GOVERNMENT_DOCUMENT: "وثيقة حكومية",
  };
  return titles[type] || titles.OTHER_GOVERNMENT_DOCUMENT;
}

function extractJson(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return "{}";
}

async function runDocumentAI(input: GovernmentDocumentInput): Promise<ExtractedGovernmentData | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const hasImage = cleanText(input.fileBase64) && cleanText(input.mimeType).startsWith("image/");
  const fallbackText = cleanText(input.fileText || input.notes);
  if (!hasImage && !fallbackText) return null;

  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Extract Saudi government document data. Return only JSON with:
{
  "documentType": "COMMERCIAL_REGISTRATION | VAT_CERTIFICATE | ZAKAT_TAX_CERTIFICATE | CHAMBER_SUBSCRIPTION | MUNICIPAL_LICENSE | WORK_PERMIT | INVESTMENT_LICENSE | OTHER_GOVERNMENT_DOCUMENT",
  "documentNumber": "",
  "title": "",
  "issuer": "",
  "ownerName": "",
  "startDate": "YYYY-MM-DD or empty",
  "expiryDate": "YYYY-MM-DD or empty",
  "renewalDate": "YYYY-MM-DD or empty",
  "city": "",
  "activity": "",
  "taxNumber": "",
  "confidence": 0.0,
  "missingFields": [],
  "summary": ""
}
Do not invent values. If a value is not visible, return empty string and include it in missingFields.
User notes: ${input.notes || ""}
File name: ${input.fileName || ""}
Text content:
${fallbackText.slice(0, 6000)}`,
    },
  ];

  if (hasImage) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${input.mimeType};base64,${input.fileBase64}` },
    });
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: "You are an OCR-quality Saudi government document analyst. Extract only visible facts." },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  try {
    const parsed = JSON.parse(extractJson(raw));
    const type = detectDocumentType(input, `${parsed.documentType || ""} ${parsed.title || ""} ${parsed.issuer || ""}`);
    const extracted: ExtractedGovernmentData = {
      documentType: parsed.documentType || type,
      documentNumber: cleanText(parsed.documentNumber),
      title: cleanText(parsed.title) || input.title || titleForDocumentType(parsed.documentType || type),
      issuer: cleanText(parsed.issuer) || input.issuer || catalog.find((item) => item.documentType === (parsed.documentType || type))?.issuer,
      ownerName: cleanText(parsed.ownerName),
      startDate: dateOnly(parsed.startDate) || undefined,
      expiryDate: dateOnly(parsed.expiryDate) || undefined,
      renewalDate: dateOnly(parsed.renewalDate) || renewalDateFor(dateOnly(parsed.expiryDate)) || undefined,
      city: cleanText(parsed.city),
      activity: cleanText(parsed.activity),
      taxNumber: cleanText(parsed.taxNumber),
      confidence: Math.min(1, Math.max(0, number(parsed.confidence))),
      missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields.map(String) : [],
      summary: cleanText(parsed.summary) || "تم استخراج بيانات الوثيقة.",
    };
    const required = requiredFieldsByType[extracted.documentType] || requiredFieldsByType.OTHER_GOVERNMENT_DOCUMENT;
    extracted.missingFields = Array.from(
      new Set([...extracted.missingFields, ...required.filter((field) => !cleanText((extracted as Record<string, unknown>)[field]))])
    );
    return extracted;
  } catch {
    return null;
  }
}

async function analyzeDocument(input: GovernmentDocumentInput) {
  const ai = await runDocumentAI(input);
  return ai || fallbackExtraction(input);
}

async function fetchOfficialText(url: string) {
  const officialUrl = requireOfficialUrl(url);
  const parsed = new URL(officialUrl);
  const candidates = [officialUrl];
  if (!parsed.hostname.startsWith("www.") && ["business.sa", "balady.gov.sa"].includes(parsed.hostname)) {
    const alternate = new URL(officialUrl);
    alternate.hostname = `www.${parsed.hostname}`;
    candidates.push(alternate.toString());
  }

  let lastError = "Official source fetch failed.";
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CandyAgentsGovernmentRelations/1.0; +https://candy-agents-v3-vercel.vercel.app)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ar-SA,ar;q=0.9,en;q=0.7",
        },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Official source returned ${res.status}`);
      requireOfficialUrl(res.url);
      const html = await res.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 9000);
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : "";
      lastError = `${err instanceof Error ? err.message : "Fetch failed"}${cause}`;
    }
  }
  throw new Error(lastError);
}

function estimateFeeFromText(text: string) {
  const sarMatches = Array.from(text.matchAll(/(?:SAR|ريال|ر\.س)\s*([0-9][0-9,.]*)|([0-9][0-9,.]*)\s*(?:SAR|ريال|ر\.س)/gi));
  const amount = sarMatches
    .map((match) => number(String(match[1] || match[2] || "").replace(/,/g, "")))
    .find((value) => value > 0);
  const noFee = /no fees|free|بدون رسوم|مجاني|لا توجد رسوم/i.test(text);
  if (noFee) return { amount: 0, text: "Official page indicates no service fee or free service." };
  if (amount !== undefined) return { amount, text: `Official page contains an amount near the service fee: SAR ${amount}. Verify final invoice before payment.` };
  return { amount: null, text: "No fixed amount was detected. The official portal should calculate the final fee or invoice." };
}

export async function seedGovernmentRelationsOS() {
  await seedGovernanceOS();
  const supabase = requireSupabase();

  const bucket = await supabase.storage.getBucket("government-documents");
  if (bucket.error) {
    const created = await supabase.storage.createBucket("government-documents", {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "application/pdf", "text/plain", "application/json", "text/csv"],
    });
    const recoverableStorageMessage = /already exists|not authorized|permission|row-level security|rls/i;
    if (created.error && !recoverableStorageMessage.test(created.error.message)) throw created.error;
  }

  const { error: departmentError } = await supabase.from("departments").upsert(
    {
      id: "government-relations",
      name: "إدارة العلاقات الحكومية",
      description: "حفظ الوثائق الحكومية، استخراج بياناتها، متابعة التجديد، ومراقبة الرسوم والبوابات الرسمية.",
    },
    { onConflict: "id" }
  );
  if (departmentError) throw departmentError;

  const { error: employeeError } = await supabase.from("employees").upsert(
    {
      id: "e-government-manager",
      full_name: "مدير العلاقات الحكومية",
      email: "government.relations@company.ai",
      role: "MANAGER",
      department_id: "government-relations",
      manager_id: "e-ceo",
      job_title: "مدير العلاقات الحكومية والامتثال",
      status: "ACTIVE",
    },
    { onConflict: "id" }
  );
  if (employeeError) throw employeeError;

  const { error: typeError } = await supabase.from("gov_document_types").upsert(
    [
      ...catalog.map((item) => ({
        id: item.documentType,
        name: titleForDocumentType(item.documentType),
        issuer: item.issuer,
        official_url: item.officialUrl,
        renewal_url: item.renewalUrl,
        required_fields: requiredFieldsByType[item.documentType] || requiredFieldsByType.OTHER_GOVERNMENT_DOCUMENT,
        automation_level: item.documentType === "VAT_CERTIFICATE" ? "PORTAL_READY" : "PORTAL_PREPARATION",
        active: true,
      })),
      {
        id: "OTHER_GOVERNMENT_DOCUMENT",
        name: titleForDocumentType("OTHER_GOVERNMENT_DOCUMENT"),
        issuer: "جهة حكومية",
        official_url: null,
        renewal_url: null,
        required_fields: requiredFieldsByType.OTHER_GOVERNMENT_DOCUMENT,
        automation_level: "MANUAL_SOURCE_REQUIRED",
        active: true,
      },
    ],
    { onConflict: "id" }
  );
  if (typeError) throw typeError;

  const { error: regulatorySourceError } = await supabase.from("gov_regulatory_sources").upsert(
    regulatorySources.map((item) => ({
      id: sourceId(item),
      document_type: item.documentType,
      issuer: item.issuer,
      title: item.title,
      official_url: item.officialUrl,
      source_kind: item.sourceKind || "SERVICE_REQUIREMENTS",
      active: true,
      check_frequency_days: 1,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "id" }
  );
  if (regulatorySourceError) throw regulatorySourceError;

  const { error: feeError } = await supabase.from("gov_fee_sources").upsert(
    catalog.map((item) => ({
      document_type: item.documentType,
      issuer: item.issuer,
      service_name: item.serviceName,
      official_url: item.officialUrl,
      renewal_url: item.renewalUrl,
      fee_amount: item.feeAmount ?? null,
      fee_currency: item.feeCurrency || "SAR",
      fee_text: item.feeText,
      source_confidence: item.sourceConfidence || "OFFICIAL_SOURCE",
    })),
    { onConflict: "document_type,issuer,service_name" }
  );
  if (feeError) throw feeError;

  const { error: integrationError } = await supabase.from("business_integrations").upsert(portalIntegrations, { onConflict: "id" });
  if (integrationError) throw integrationError;

  const { error: costError } = await supabase.from("cost_centers").upsert(
    { id: "cc-government", name: "Government Relations", owner_role: "Government Relations Manager", monthly_budget: 8000, status: "ACTIVE" },
    { onConflict: "id" }
  );
  if (costError) throw costError;
}

export async function getGovernmentRelationsOS() {
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const [types, documents, files, fees, tasks, integrations, auditRows, accessRows, sources, updates, companyTasks, revisions] = await Promise.all([
    supabase.from("gov_document_types").select("*").order("name", { ascending: true }),
    supabase.from("gov_documents").select("*").order("created_at", { ascending: false }).limit(80),
    supabase
      .from("gov_document_files")
      .select("id, document_id, file_name, mime_type, file_size, storage_bucket, storage_path, file_category, version_no, is_current, created_at")
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.from("gov_fee_sources").select("*").order("document_type", { ascending: true }),
    supabase.from("gov_renewal_tasks").select("*").order("due_date", { ascending: true }).limit(80),
    supabase.from("business_integrations").select("*").like("id", "gov-%").order("provider", { ascending: true }),
    supabase.from("audit_log").select("*").eq("entity_type", "gov_documents").order("created_at", { ascending: false }).limit(30),
    supabase.from("gov_document_access_logs").select("*").order("created_at", { ascending: false }).limit(50),
    supabase.from("gov_regulatory_sources").select("*").order("title", { ascending: true }),
    supabase.from("gov_regulatory_updates").select("*").order("detected_at", { ascending: false }).limit(50),
    supabase.from("tasks").select("*").eq("source_table", "gov_documents").order("due_date", { ascending: true }).limit(100),
    supabase.from("gov_document_revisions").select("id, document_id, revision_no, change_type, changed_fields, change_reason, actor_role, created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  for (const result of [types, documents, files, fees, tasks, integrations, auditRows, accessRows, sources, updates, companyTasks, revisions]) {
    if (result.error) throw result.error;
  }

  const documentRows = documents.data || [];
  const expiringSoon = documentRows.filter((doc: any) => ["RENEWAL_SOON", "RENEWAL_URGENT"].includes(doc.status)).length;
  const expired = documentRows.filter((doc: any) => doc.status === "EXPIRED").length;
  const missingData = documentRows.filter((doc: any) => Array.isArray(doc.missing_fields) && doc.missing_fields.length > 0).length;
  const totalEstimatedFees = (fees.data || []).reduce((sum: number, item: any) => sum + number(item.fee_amount), 0);
  const readyPortals = (integrations.data || []).filter((item: any) => item.status === "CONNECTED").length;

  return {
    types: types.data || [],
    documents: documentRows,
    files: files.data || [],
    fees: fees.data || [],
    tasks: tasks.data || [],
    integrations: integrations.data || [],
    audits: (auditRows.data || []).map(toLegacyDecisionAuditRow),
    accessLogs: accessRows.data || [],
    regulatorySources: sources.data || [],
    regulatoryUpdates: updates.data || [],
    companyTasks: companyTasks.data || [],
    revisions: revisions.data || [],
    metrics: {
      totalDocuments: documentRows.length,
      activeDocuments: documentRows.filter((doc: any) => doc.status === "ACTIVE").length,
      expiringSoon,
      expired,
      missingData,
      totalEstimatedFees,
      readyPortals,
      lastCheckedSources: (fees.data || []).filter((item: any) => item.last_checked_at).length,
      storedFiles: (files.data || []).length,
      openRegulatoryUpdates: (updates.data || []).filter((item: any) => item.status === "OPEN").length,
      monitoredSources: (sources.data || []).filter((item: any) => item.active).length,
      openCompanyTasks: (companyTasks.data || []).filter((item: any) => !["DONE", "BLOCKED"].includes(item.status)).length,
    },
  };
}

async function findFeeSource(documentType: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("gov_fee_sources").select("*").eq("document_type", documentType).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function ensureCompanyDocumentTask(
  document: any,
  options: {
    taskType?: "GOVERNMENT_RENEWAL" | "GOVERNMENT_REGULATORY_CHANGE";
    regulatoryUpdateId?: string;
    title?: string;
    description?: string;
    dueDate?: string | null;
    priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
    forceOpen?: boolean;
  } = {}
) {
  const supabase = requireSupabase();
  const taskType = options.taskType || "GOVERNMENT_RENEWAL";
  const taskId = taskType === "GOVERNMENT_REGULATORY_CHANGE"
    ? `task-gov-reg-${options.regulatoryUpdateId}-${document.id}`
    : `task-gov-renew-${document.id}`;
  const shouldOpen = options.forceOpen || taskType === "GOVERNMENT_REGULATORY_CHANGE" ||
    ["EXPIRED", "RENEWAL_URGENT", "RENEWAL_SOON", "NEEDS_REVIEW"].includes(document.status) ||
    (Array.isArray(document.missing_fields) && document.missing_fields.length > 0);
  const { data: existing, error: existingError } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (existingError) throw existingError;

  if (!shouldOpen) {
    if (existing && !["DONE", "BLOCKED"].includes(existing.status)) {
      const { error } = await supabase.from("tasks").update({
        status: "DONE",
        progress_percent: 100,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", taskId);
      if (error) throw error;
    }
    return existing || null;
  }

  const priority = options.priority || (document.status === "EXPIRED" || document.status === "RENEWAL_URGENT" ? "URGENT" : "HIGH");
  const dueDate = options.dueDate || document.renewal_date || document.expiry_date || todayIso();
  const preservedStatus = existing && ["IN_PROGRESS", "REVIEW"].includes(existing.status) ? existing.status : "TODO";
  const payload = {
    id: taskId,
    title: options.title || `متابعة وتجديد ${document.title}`,
    description: options.description || `مراجعة الوثيقة الحكومية ${document.title} وإكمال متطلبات التجديد قبل ${dueDate}.`,
    content: options.description || `متابعة حالة الوثيقة والرسوم والرابط الرسمي وإنجاز التجديد ضمن المهلة.`,
    status: preservedStatus,
    priority,
    assigned_to: "e-government-manager",
    created_by: "e-ceo",
    department_id: "government-relations",
    due_date: dueDate,
    progress_percent: existing?.progress_percent || 0,
    owner_role: "Government Relations Manager",
    source_table: "gov_documents",
    source_id: document.id,
    task_type: taskType,
    metadata: {
      document_id: document.id,
      document_type: document.document_type,
      regulatory_update_id: options.regulatoryUpdateId || null,
      official_url: document.official_url || null,
      renewal_url: document.renewal_url || null,
    },
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("tasks").upsert(payload, { onConflict: "id" }).select().single();
  if (error) throw error;

  if (!existing) {
    await supabase.from("notifications").insert({
      id: newId("notif-gov"),
      employee_id: "e-government-manager",
      title: taskType === "GOVERNMENT_REGULATORY_CHANGE" ? "تحديث حكومي يحتاج مراجعة" : "وثيقة حكومية تحتاج متابعة",
      message: payload.title,
      type: "TASK",
    });
  }
  return data;
}

async function createRenewalTask(document: any, feeSource: any) {
  const supabase = requireSupabase();
  const dueDate = document.renewal_date || renewalDateFor(document.expiry_date) || document.expiry_date || todayIso();
  const priority = document.status === "EXPIRED" || document.status === "RENEWAL_URGENT" ? "URGENT" : document.status === "RENEWAL_SOON" ? "HIGH" : "MEDIUM";
  const taskId = `renew-${document.id}`;
  const { data: existing, error: existingError } = await supabase.from("gov_renewal_tasks").select("*").eq("id", taskId).maybeSingle();
  if (existingError) throw existingError;
  const desiredStatus = document.status === "ACTIVE" ? "SCHEDULED" : "OPEN";
  const status = existing && ["IN_PROGRESS", "READY_FOR_AUTOMATED_SUBMISSION", "PENDING_PORTAL_AUTHORIZATION"].includes(existing.status)
    ? existing.status
    : existing?.status === "DONE" && desiredStatus === "SCHEDULED"
      ? "DONE"
      : desiredStatus;
  const { data, error } = await supabase
    .from("gov_renewal_tasks")
    .upsert(
      {
        id: taskId,
        document_id: document.id,
        task_type: "RENEWAL_PREPARATION",
        title: `تجهيز تجديد ${document.title || titleForDocumentType(document.document_type)}`,
        due_date: dueDate,
        priority,
        status,
        fee_amount: feeSource?.fee_amount ?? null,
        fee_currency: feeSource?.fee_currency || "SAR",
        official_url: feeSource?.official_url || document.official_url,
        renewal_url: feeSource?.renewal_url || document.renewal_url,
        checklist: [
          "مراجعة رقم الوثيقة والجهة المصدرة",
          "التحقق من تاريخ الانتهاء والتجديد",
          "فتح رابط الجهة الرسمي والتحقق من الرسوم النهائية",
          "رفع الطلب للاعتماد قبل الدفع أو التجديد",
        ],
      },
      { onConflict: "id" }
    )
    .select()
    .single();
  if (error) throw error;
  const companyTask = await ensureCompanyDocumentTask(document, { dueDate, priority });
  if (companyTask?.id && data.company_task_id !== companyTask.id) {
    const linked = await supabase.from("gov_renewal_tasks").update({ company_task_id: companyTask.id, updated_at: new Date().toISOString() }).eq("id", data.id).select().single();
    if (linked.error) throw linked.error;
    return linked.data;
  }
  return data;
}

async function storeGovernmentDocumentFile(documentId: string, input: GovernmentDocumentInput, fileCategory: string) {
  if (!input.fileName && !input.fileBase64 && !input.fileText) return null;
  const supabase = requireSupabase();
  const existingFiles = await supabase.from("gov_document_files").select("version_no").eq("document_id", documentId);
  if (existingFiles.error) throw existingFiles.error;
  const versionNo = Math.max(0, ...(existingFiles.data || []).map((file: any) => number(file.version_no))) + 1;
  const storagePath = storagePathFor(documentId, input.fileName);
  const fileBody = input.fileBase64 ? base64ToBuffer(input.fileBase64) : Buffer.from(input.fileText || "", "utf8");
  const uploaded = await supabase.storage.from("government-documents").upload(storagePath, fileBody, {
    contentType: input.mimeType || (input.fileText ? "text/plain" : "application/octet-stream"),
    upsert: false,
  });
  if (uploaded.error) throw uploaded.error;

  await supabase.from("gov_document_files").update({ is_current: false }).eq("document_id", documentId);
  const { data, error } = await supabase.from("gov_document_files").insert({
    document_id: documentId,
    file_name: input.fileName || "government-document",
    mime_type: input.mimeType || "application/octet-stream",
    file_size: fileBody.length,
    storage_bucket: "government-documents",
    storage_path: storagePath,
    file_category: input.category || fileCategory,
    version_no: versionNo,
    is_current: true,
    text_payload: input.fileText || null,
  }).select().single();
  if (error) {
    await supabase.storage.from("government-documents").remove([storagePath]);
    throw error;
  }
  return data;
}

export async function uploadGovernmentDocument(input: GovernmentDocumentInput) {
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const extracted = await analyzeDocument(input);
  const feeSource = await findFeeSource(extracted.documentType);
  const status = documentStatus(extracted.expiryDate);
  const renewalDate = extracted.renewalDate || renewalDateFor(extracted.expiryDate);

  const { data: document, error: documentError } = await supabase
    .from("gov_documents")
    .insert({
      document_type: extracted.documentType,
      title: extracted.title || input.title || titleForDocumentType(extracted.documentType),
      document_number: extracted.documentNumber || null,
      issuer: extracted.issuer || feeSource?.issuer || input.issuer || null,
      owner_name: extracted.ownerName || null,
      tax_number: extracted.taxNumber || null,
      start_date: extracted.startDate || null,
      expiry_date: extracted.expiryDate || null,
      renewal_date: renewalDate,
      city: extracted.city || null,
      activity: extracted.activity || null,
      status,
      official_url: feeSource?.official_url || null,
      renewal_url: feeSource?.renewal_url || null,
      fee_amount: feeSource?.fee_amount ?? null,
      fee_currency: feeSource?.fee_currency || "SAR",
      fee_text: feeSource?.fee_text || null,
      extracted_data: extracted,
      missing_fields: extracted.missingFields,
      extraction_confidence: extracted.confidence,
      notes: input.notes || null,
      last_verified_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (documentError) throw documentError;

  const file = await storeGovernmentDocumentFile(document.id, input, extracted.documentType);

  const { error: extractionError } = await supabase.from("gov_document_extractions").insert({
    document_id: document.id,
    extraction_engine: process.env.OPENAI_API_KEY ? "openai_gpt_4o_mini" : "rules_fallback",
    raw_text: input.fileText || input.notes || "",
    extracted_json: extracted,
    confidence: extracted.confidence,
    status: extracted.missingFields.length ? "NEEDS_REVIEW" : "EXTRACTED",
  });
  if (extractionError) throw extractionError;

  const task = await createRenewalTask(document, feeSource);
  const governance = await evaluateGovernedAction({
    title: `Government document renewal control: ${document.title}`,
    entityType: "gov_documents",
    entityId: document.id,
    amount: number(feeSource?.fee_amount),
    riskLevel: status === "EXPIRED" || extracted.missingFields.length ? "HIGH" : status === "RENEWAL_URGENT" ? "HIGH" : "LOW",
    actorRole: "Government Relations Manager",
    metadata: {
      actionKind: "GOVERNMENT_RENEWAL",
      document_id: document.id,
      status,
      missingFields: extracted.missingFields,
      renewalTaskId: task.id,
    },
  });

  if (["EXPIRED", "RENEWAL_URGENT", "NEEDS_REVIEW"].includes(status) || extracted.missingFields.length) {
    await supabase.from("ceo_office_items").insert({
      id: newId("ceo-gov"),
      item_type: "GOVERNMENT_DOCUMENT_REVIEW",
      title: `${document.title} يحتاج متابعة حكومية`,
      owner_role: "Government Relations Manager",
      status: "PENDING",
      priority: status === "EXPIRED" ? "URGENT" : "HIGH",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      notes: `الحالة: ${status}. الحقول الناقصة: ${extracted.missingFields.join(", ") || "لا يوجد"}.`,
      metadata: { document_id: document.id, renewal_task_id: task.id, governance },
    });
  }

  await logDecision({
    decisionType: "GOVERNMENT_DOCUMENT_UPLOADED",
    entityType: "gov_documents",
    entityId: document.id,
    actorRole: "Government Relations Manager",
    action: `Uploaded and extracted ${document.title}`,
    amount: number(feeSource?.fee_amount),
    riskLevel: status === "ACTIVE" ? "LOW" : "HIGH",
    approvalStatus: governance.approvalStatus,
    metadata: { extracted, task, feeSource },
  });

  return { document, extraction: extracted, file, task, feeSource, governance };
}

export async function updateGovernmentDocument(documentId: string, input: GovernmentDocumentInput) {
  if (!documentId) throw new Error("Document id is required.");
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const { data: existing, error: existingError } = await supabase.from("gov_documents").select("*").eq("id", documentId).single();
  if (existingError) throw existingError;

  const replacementExtraction = input.fileName || input.fileBase64 || input.fileText ? await analyzeDocument(input) : null;
  const documentType = input.documentType && knownDocumentTypes.has(input.documentType) ? input.documentType : existing.document_type;
  const feeSource = await findFeeSource(documentType);
  const value = (manual: string | undefined, extracted: string | undefined, current: unknown) => {
    if (manual !== undefined) return cleanText(manual) || null;
    if (cleanText(extracted)) return cleanText(extracted);
    return current ?? null;
  };
  const startDate = input.startDate !== undefined
    ? dateOnly(input.startDate)
    : replacementExtraction?.startDate || existing.start_date;
  const expiryDate = input.expiryDate !== undefined
    ? dateOnly(input.expiryDate)
    : replacementExtraction?.expiryDate || existing.expiry_date;
  const renewalDate = input.renewalDate !== undefined
    ? dateOnly(input.renewalDate) || renewalDateFor(expiryDate)
    : replacementExtraction?.renewalDate || existing.renewal_date || renewalDateFor(expiryDate);
  const title = cleanText(input.title !== undefined ? input.title : replacementExtraction?.title || existing.title);
  if (!title) throw new Error("Document title is required.");

  const merged = {
    document_type: documentType,
    title,
    document_number: value(input.documentNumber, replacementExtraction?.documentNumber, existing.document_number),
    issuer: value(input.issuer, replacementExtraction?.issuer, existing.issuer || feeSource?.issuer),
    owner_name: value(input.ownerName, replacementExtraction?.ownerName, existing.owner_name),
    tax_number: value(input.taxNumber, replacementExtraction?.taxNumber, existing.tax_number),
    start_date: startDate,
    expiry_date: expiryDate,
    renewal_date: renewalDate,
    city: value(input.city, replacementExtraction?.city, existing.city),
    activity: value(input.activity, replacementExtraction?.activity, existing.activity),
    notes: input.notes !== undefined ? cleanText(input.notes) || null : existing.notes,
  };
  const required = requiredFieldsByType[documentType] || requiredFieldsByType.OTHER_GOVERNMENT_DOCUMENT;
  const fieldAliases: Record<string, keyof typeof merged> = {
    documentNumber: "document_number",
    issuer: "issuer",
    ownerName: "owner_name",
    taxNumber: "tax_number",
    startDate: "start_date",
    expiryDate: "expiry_date",
    city: "city",
    activity: "activity",
  };
  const missingFields = required.filter((field) => {
    const key = fieldAliases[field];
    return !key || !cleanText(merged[key]);
  });
  const status = documentStatus(expiryDate);
  const revisionNo = number(existing.revision_no) + 1;
  const patch = {
    ...merged,
    status,
    official_url: feeSource?.official_url || existing.official_url,
    renewal_url: feeSource?.renewal_url || existing.renewal_url,
    fee_amount: feeSource?.fee_amount ?? existing.fee_amount,
    fee_currency: feeSource?.fee_currency || existing.fee_currency || "SAR",
    fee_text: feeSource?.fee_text || existing.fee_text,
    extracted_data: replacementExtraction || existing.extracted_data || {},
    missing_fields: missingFields,
    extraction_confidence: replacementExtraction?.confidence ?? existing.extraction_confidence,
    revision_no: revisionNo,
    last_verified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateError } = await supabase.from("gov_documents").update(patch).eq("id", documentId).select().single();
  if (updateError) throw updateError;
  const before = documentSnapshot(existing);
  const after = documentSnapshot(updated);
  const changedFields = Object.keys(after).filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
  const { error: revisionError } = await supabase.from("gov_document_revisions").insert({
    document_id: documentId,
    revision_no: revisionNo,
    change_type: input.fileName ? "EDIT_AND_NEW_FILE_VERSION" : "EDIT",
    changed_fields: changedFields,
    before_data: before,
    after_data: after,
    change_reason: cleanText(input.changeReason) || "تحديث بيانات الوثيقة",
    actor_role: cleanText(input.actorRole) || "Government Relations Manager",
  });
  if (revisionError) throw revisionError;

  const file = await storeGovernmentDocumentFile(documentId, input, documentType);
  if (replacementExtraction) {
    const { error: extractionError } = await supabase.from("gov_document_extractions").insert({
      document_id: documentId,
      extraction_engine: process.env.OPENAI_API_KEY ? "openai_gpt_4o_mini" : "rules_fallback",
      raw_text: input.fileText || input.notes || "",
      extracted_json: replacementExtraction,
      confidence: replacementExtraction.confidence,
      status: replacementExtraction.missingFields.length ? "NEEDS_REVIEW" : "EXTRACTED",
    });
    if (extractionError) throw extractionError;
  }

  const task = await createRenewalTask(updated, feeSource);
  await supabase.from("gov_document_access_logs").insert({
    document_id: documentId,
    file_id: file?.id || null,
    actor_role: cleanText(input.actorRole) || "Government Relations Manager",
    action: file ? "EDIT_AND_UPLOAD_VERSION" : "EDIT",
    metadata: { revision_no: revisionNo, changed_fields: changedFields, change_reason: input.changeReason || null },
  });
  await logDecision({
    decisionType: "GOVERNMENT_DOCUMENT_UPDATED",
    entityType: "gov_documents",
    entityId: documentId,
    actorRole: cleanText(input.actorRole) || "Government Relations Manager",
    action: `Updated ${updated.title} to revision ${revisionNo}`,
    riskLevel: status === "EXPIRED" || missingFields.length ? "HIGH" : "LOW",
    approvalStatus: "COMPLETED",
    metadata: { changedFields, revisionNo, taskId: task.id, fileId: file?.id || null },
  });
  return { document: updated, file, task, revisionNo, changedFields };
}

export async function deleteGovernmentDocument(documentId: string, confirmationTitle: string, actorRole = "Government Relations Manager") {
  if (!documentId) throw new Error("Document id is required.");
  const supabase = requireSupabase();
  const { data: document, error: documentError } = await supabase.from("gov_documents").select("*").eq("id", documentId).single();
  if (documentError) throw documentError;
  if (cleanText(confirmationTitle) !== cleanText(document.title)) {
    throw new Error("اكتب اسم الوثيقة كما هو لتأكيد الحذف.");
  }
  const { data: files, error: filesError } = await supabase.from("gov_document_files").select("id, storage_bucket, storage_path, file_name").eq("document_id", documentId);
  if (filesError) throw filesError;
  const groupedPaths = new Map<string, string[]>();
  for (const file of files || []) {
    if (!file.storage_path) continue;
    const bucket = file.storage_bucket || "government-documents";
    groupedPaths.set(bucket, [...(groupedPaths.get(bucket) || []), file.storage_path]);
  }
  for (const [bucket, paths] of groupedPaths) {
    const removed = await supabase.storage.from(bucket).remove(paths);
    if (removed.error) throw removed.error;
  }

  const taskDelete = await supabase.from("tasks").delete().eq("source_table", "gov_documents").eq("source_id", documentId);
  if (taskDelete.error) throw taskDelete.error;
  const deleted = await supabase.from("gov_documents").delete().eq("id", documentId).select("id").single();
  if (deleted.error) throw deleted.error;
  await logDecision({
    decisionType: "GOVERNMENT_DOCUMENT_DELETED",
    entityType: "gov_documents_deleted",
    entityId: documentId,
    actorRole,
    action: `Permanently deleted ${document.title} and ${files?.length || 0} stored file(s)`,
    riskLevel: "HIGH",
    approvalStatus: "COMPLETED",
    metadata: { deletedDocument: documentSnapshot(document), deletedFiles: files || [] },
  });
  return { id: documentId, title: document.title, deletedFiles: files?.length || 0 };
}

export async function updateGovernmentRenewalTask(taskId: string, status: string) {
  if (!taskId) throw new Error("Renewal task id is required.");
  const allowed = new Set(["OPEN", "SCHEDULED", "IN_PROGRESS", "DONE", "BLOCKED"]);
  if (!allowed.has(status)) throw new Error("Invalid renewal task status.");
  const supabase = requireSupabase();
  const { data: task, error } = await supabase.from("gov_renewal_tasks").update({ status, updated_at: new Date().toISOString() }).eq("id", taskId).select().single();
  if (error) throw error;
  if (task.company_task_id) {
    const companyStatus = status === "DONE" ? "DONE" : status === "IN_PROGRESS" ? "IN_PROGRESS" : status === "BLOCKED" ? "BLOCKED" : "TODO";
    const companyPatch: Record<string, unknown> = {
      status: companyStatus,
      progress_percent: status === "DONE" ? 100 : status === "IN_PROGRESS" ? 50 : 0,
      updated_at: new Date().toISOString(),
    };
    if (status === "DONE") companyPatch.completed_at = new Date().toISOString();
    const companyUpdate = await supabase.from("tasks").update(companyPatch).eq("id", task.company_task_id);
    if (companyUpdate.error) throw companyUpdate.error;
  }
  return task;
}

export async function syncGovernmentDocumentCompliance() {
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const { data: documents, error } = await supabase.from("gov_documents").select("*").order("expiry_date", { ascending: true });
  if (error) throw error;
  let opened = 0;
  let closed = 0;
  for (const document of documents || []) {
    const status = documentStatus(document.expiry_date);
    const renewalDate = document.renewal_date || renewalDateFor(document.expiry_date);
    let current = document;
    if (status !== document.status || renewalDate !== document.renewal_date) {
      const updated = await supabase.from("gov_documents").update({ status, renewal_date: renewalDate, updated_at: new Date().toISOString() }).eq("id", document.id).select().single();
      if (updated.error) throw updated.error;
      current = updated.data;
    }
    const feeSource = await findFeeSource(current.document_type);
    const renewalTask = await createRenewalTask(current, feeSource);
    if (renewalTask.company_task_id) {
      if (["OPEN", "IN_PROGRESS"].includes(renewalTask.status)) opened += 1;
      if (renewalTask.status === "DONE") closed += 1;
    }
  }
  return { documents: documents?.length || 0, opened, closed };
}

export async function refreshGovernmentFees() {
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const { data: sources, error } = await supabase.from("gov_fee_sources").select("*").order("document_type", { ascending: true });
  if (error) throw error;

  const refreshed = await Promise.all((sources || []).map(async (source: any) => {
    let update: Record<string, unknown>;
    try {
      const officialText = await fetchOfficialText(source.official_url);
      const estimate = estimateFeeFromText(officialText);
      update = {
        fee_amount: estimate.amount,
        fee_text: estimate.text,
        source_confidence: estimate.amount === null ? "OFFICIAL_SOURCE_REQUIRES_PORTAL_INVOICE" : "OFFICIAL_SOURCE_TEXT_MATCH",
        last_checked_at: new Date().toISOString(),
        last_checked_status: "SUCCESS",
        last_checked_excerpt: officialText.slice(0, 900),
      };
    } catch (err) {
      update = {
        last_checked_at: new Date().toISOString(),
        last_checked_status: "FAILED",
        last_checked_excerpt: err instanceof Error ? err.message : "Unable to fetch official source.",
      };
    }

    const { data, error: updateError } = await supabase.from("gov_fee_sources").update(update).eq("id", source.id).select().single();
    if (updateError) throw updateError;
    return data;
  }));

  await logDecision({
    decisionType: "GOVERNMENT_FEES_REFRESHED",
    entityType: "gov_fee_sources",
    actorRole: "Government Relations Manager",
    action: `Refreshed ${refreshed.length} official government fee sources`,
    approvalStatus: "COMPLETED",
    metadata: { refreshed: refreshed.map((item: any) => ({ id: item.id, status: item.last_checked_status })) },
  });

  return refreshed;
}

async function analyzeRegulatoryChange(source: any, previousExcerpt: string, currentExcerpt: string) {
  const fallback = {
    title: `تغير في المصدر الرسمي: ${source.title}`,
    summary: "تم رصد اختلاف في محتوى الصفحة الرسمية. يجب مراجعة المتطلبات والرسوم والمواعيد قبل تنفيذ أي إجراء حكومي جديد.",
    changeType: "OFFICIAL_PAGE_CHANGED",
    impactLevel: "MEDIUM",
  };
  if (!process.env.OPENAI_API_KEY) return fallback;
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You analyze changes in official Saudi government service and regulation pages. Do not invent legal conclusions. Return concise JSON only.",
          },
          {
            role: "user",
            content: `Compare the previous and current official source text for ${source.title}.
Return JSON: {"title":"Arabic title","summary":"Arabic actionable summary","changeType":"FEE|REQUIREMENT|DEADLINE|PORTAL_PROCESS|REGULATION|TECHNICAL_PAGE_CHANGE","impactLevel":"LOW|MEDIUM|HIGH|CRITICAL"}.
Use TECHNICAL_PAGE_CHANGE and LOW if the difference appears cosmetic or unclear.
Previous:
${previousExcerpt.slice(0, 6000)}

Current:
${currentExcerpt.slice(0, 6000)}`,
          },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const parsed = JSON.parse(extractJson(data.choices?.[0]?.message?.content || "{}"));
    const impact = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.impactLevel) ? parsed.impactLevel : "MEDIUM";
    return {
      title: cleanText(parsed.title) || fallback.title,
      summary: cleanText(parsed.summary) || fallback.summary,
      changeType: cleanText(parsed.changeType) || fallback.changeType,
      impactLevel: impact,
    };
  } catch {
    return fallback;
  }
}

async function createRegulatoryFollowUp(update: any, source: any) {
  const supabase = requireSupabase();
  const { data: documents, error } = await supabase.from("gov_documents").select("*").eq("document_type", source.document_type);
  if (error) throw error;
  const affectedIds: string[] = [];

  for (const document of documents || []) {
    affectedIds.push(document.id);
    const documentUpdate = await supabase.from("gov_documents").update({
      regulatory_status: "ACTION_REQUIRED",
      latest_regulatory_update_id: update.id,
      updated_at: new Date().toISOString(),
    }).eq("id", document.id).select().single();
    if (documentUpdate.error) throw documentUpdate.error;
    const current = documentUpdate.data;
    const priority = update.impact_level === "CRITICAL" ? "URGENT" : update.impact_level === "HIGH" ? "HIGH" : "MEDIUM";
    const dueDate = new Date(Date.now() + (priority === "URGENT" ? 86400000 : priority === "HIGH" ? 3 * 86400000 : 7 * 86400000)).toISOString();
    const companyTask = await ensureCompanyDocumentTask(current, {
      taskType: "GOVERNMENT_REGULATORY_CHANGE",
      regulatoryUpdateId: update.id,
      title: `مراجعة أثر تحديث حكومي على ${document.title}`,
      description: `${update.summary}\nالمصدر الرسمي: ${source.official_url}`,
      dueDate,
      priority,
      forceOpen: true,
    });
    const regulatoryTask = await supabase.from("gov_renewal_tasks").upsert({
      id: `reg-${update.id}-${document.id}`,
      document_id: document.id,
      task_type: "REGULATORY_CHANGE_REVIEW",
      title: `مراجعة تحديث ${source.title}`,
      due_date: dueDate.slice(0, 10),
      priority,
      status: "OPEN",
      official_url: source.official_url,
      renewal_url: document.renewal_url,
      checklist: [
        "فتح المصدر الرسمي والتحقق من نص التغيير",
        "تحديد أثر التغيير على الوثيقة والإجراء التشغيلي",
        "تحديث بيانات الوثيقة أو خطة التجديد عند الحاجة",
        "توثيق المراجعة وإغلاق المهمة",
      ],
      company_task_id: companyTask?.id || null,
      regulatory_update_id: update.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (regulatoryTask.error) throw regulatoryTask.error;
  }

  const updateResult = await supabase.from("gov_regulatory_updates").update({
    affected_document_ids: affectedIds,
    affected_document_count: affectedIds.length,
  }).eq("id", update.id);
  if (updateResult.error) throw updateResult.error;
  const alert = await supabase.from("operational_alerts").upsert({
    alert_key: `gov-regulatory-${update.id}`,
    department: "government_relations",
    severity: update.impact_level === "CRITICAL" ? "CRITICAL" : update.impact_level === "HIGH" ? "HIGH" : "MEDIUM",
    title: update.title,
    message: `${update.summary} الوثائق المتأثرة: ${affectedIds.length}.`,
    source_table: "gov_regulatory_updates",
    source_id: update.id,
    action_url: "/departments/government-relations",
    status: "OPEN",
    last_seen_at: new Date().toISOString(),
    metadata: { source_id: source.id, document_type: source.document_type, official_url: source.official_url },
  }, { onConflict: "alert_key" });
  if (alert.error) throw alert.error;
  return affectedIds;
}

export async function addGovernmentRegulatorySource(input: RegulatorySourceInput) {
  await seedGovernmentRelationsOS();
  if (!knownDocumentTypes.has(input.documentType)) throw new Error("Select a valid government document type.");
  if (!cleanText(input.title) || !cleanText(input.issuer)) throw new Error("Source title and issuer are required.");
  const supabase = requireSupabase();
  const payload = {
    id: sourceId(input),
    document_type: input.documentType,
    issuer: cleanText(input.issuer),
    title: cleanText(input.title),
    official_url: requireOfficialUrl(input.officialUrl),
    source_kind: cleanText(input.sourceKind) || "SERVICE_REQUIREMENTS",
    active: true,
    check_frequency_days: 1,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("gov_regulatory_sources").upsert(payload, { onConflict: "id" }).select().single();
  if (error) throw error;
  return data;
}

export async function refreshGovernmentRegulations(options: { force?: boolean } = {}) {
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const sync = await syncGovernmentDocumentCompliance();
  const { data: sources, error } = await supabase.from("gov_regulatory_sources").select("*").eq("active", true).order("title", { ascending: true });
  if (error) throw error;
  const results: Array<Record<string, unknown>> = [];

  for (const source of sources || []) {
    const lastChecked = source.last_checked_at ? new Date(source.last_checked_at).getTime() : 0;
    const checkInterval = Math.max(1, number(source.check_frequency_days)) * 86400000;
    if (!options.force && lastChecked && Date.now() - lastChecked < checkInterval) {
      results.push({ sourceId: source.id, status: "SKIPPED_RECENTLY", updateId: null });
      continue;
    }
    try {
      const officialText = normalizedOfficialText(await fetchOfficialText(source.official_url));
      if (!officialText) throw new Error("Official page returned no readable content.");
      const hash = contentHash(officialText);
      const previousHash = source.last_hash || "";
      const changed = Boolean(previousHash && previousHash !== hash);
      let update = null;
      let createdUpdate = false;
      if (changed) {
        const existingUpdate = await supabase.from("gov_regulatory_updates").select("*").eq("source_id", source.id).eq("new_hash", hash).maybeSingle();
        if (existingUpdate.error) throw existingUpdate.error;
        if (existingUpdate.data) {
          update = existingUpdate.data;
        } else {
          const analysis = await analyzeRegulatoryChange(source, source.last_excerpt || "", officialText);
          const inserted = await supabase.from("gov_regulatory_updates").insert({
            source_id: source.id,
            document_type: source.document_type,
            title: analysis.title,
            summary: analysis.summary,
            change_type: analysis.changeType,
            impact_level: analysis.impactLevel,
            status: analysis.changeType === "TECHNICAL_PAGE_CHANGE" && analysis.impactLevel === "LOW" ? "MONITORING" : "OPEN",
            official_url: source.official_url,
            old_hash: previousHash,
            new_hash: hash,
            previous_excerpt: source.last_excerpt || "",
            current_excerpt: officialText.slice(0, 9000),
          }).select().single();
          if (inserted.error) throw inserted.error;
          update = inserted.data;
          createdUpdate = true;
          if (update.status === "OPEN") await createRegulatoryFollowUp(update, source);
        }
      }
      const sourceUpdate = await supabase.from("gov_regulatory_sources").update({
        last_hash: hash,
        last_excerpt: officialText.slice(0, 9000),
        last_checked_at: new Date().toISOString(),
        last_checked_status: changed ? "CHANGE_DETECTED" : previousHash ? "UNCHANGED" : "BASELINE_CREATED",
        last_error: null,
        change_count: number(source.change_count) + (createdUpdate ? 1 : 0),
        updated_at: new Date().toISOString(),
      }).eq("id", source.id);
      if (sourceUpdate.error) throw sourceUpdate.error;
      results.push({ sourceId: source.id, status: changed ? "CHANGE_DETECTED" : previousHash ? "UNCHANGED" : "BASELINE_CREATED", updateId: update?.id || null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to fetch official source.";
      await supabase.from("gov_regulatory_sources").update({
        last_checked_at: new Date().toISOString(),
        last_checked_status: "FAILED",
        last_error: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", source.id);
      results.push({ sourceId: source.id, status: "FAILED", error: message });
    }
  }

  await logDecision({
    decisionType: "GOVERNMENT_REGULATIONS_MONITORED",
    entityType: "gov_regulatory_sources",
    actorRole: "Government Relations Manager",
    action: `Checked ${results.length} official government sources`,
    approvalStatus: "COMPLETED",
    metadata: { results, sync },
  });
  return { sync, results, changes: results.filter((item) => item.status === "CHANGE_DETECTED").length };
}

export async function reviewGovernmentRegulatoryUpdate(updateId: string, status: "RESOLVED" | "MONITORING") {
  if (!updateId) throw new Error("Regulatory update id is required.");
  const supabase = requireSupabase();
  const { data: update, error } = await supabase.from("gov_regulatory_updates").update({
    status,
    reviewed_at: new Date().toISOString(),
  }).eq("id", updateId).select().single();
  if (error) throw error;
  if (status === "RESOLVED") {
    const companyTasks = await supabase.from("tasks").update({
      status: "DONE",
      progress_percent: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("task_type", "GOVERNMENT_REGULATORY_CHANGE").contains("metadata", { regulatory_update_id: updateId });
    if (companyTasks.error) throw companyTasks.error;
    const renewalTasks = await supabase.from("gov_renewal_tasks").update({ status: "DONE", updated_at: new Date().toISOString() }).eq("regulatory_update_id", updateId);
    if (renewalTasks.error) throw renewalTasks.error;
    const alerts = await supabase.from("operational_alerts").update({ status: "RESOLVED", resolved_at: new Date().toISOString() }).eq("source_table", "gov_regulatory_updates").eq("source_id", updateId);
    if (alerts.error) throw alerts.error;
    const openUpdates = await supabase.from("gov_regulatory_updates").select("id", { count: "exact", head: true }).eq("document_type", update.document_type).eq("status", "OPEN");
    if (openUpdates.error) throw openUpdates.error;
    if ((openUpdates.count || 0) === 0) {
      const documents = await supabase.from("gov_documents").update({ regulatory_status: "CURRENT", updated_at: new Date().toISOString() }).eq("document_type", update.document_type);
      if (documents.error) throw documents.error;
    }
  }
  return update;
}

export async function createGovernmentRenewalPlan(documentId: string) {
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const { data: document, error } = await supabase.from("gov_documents").select("*").eq("id", documentId).single();
  if (error) throw error;
  const feeSource = await findFeeSource(document.document_type);
  const task = await createRenewalTask(document, feeSource);

  const amount = number(feeSource?.fee_amount || document.fee_amount);
  const governance = await evaluateGovernedAction({
    title: `Prepare renewal for ${document.title}`,
    entityType: "gov_documents",
    entityId: document.id,
    amount,
    riskLevel: document.status === "EXPIRED" ? "HIGH" : "LOW",
    actorRole: "Government Relations Manager",
    metadata: {
      actionKind: "GOVERNMENT_RENEWAL",
      renewalTaskId: task.id,
      official_url: feeSource?.official_url,
      renewal_url: feeSource?.renewal_url,
    },
  });

  const { data: action, error: actionError } = await supabase.from("business_actions").insert({
    action_type: "GOVERNMENT_RENEWAL_PREPARATION",
    title: `تجهيز تجديد ${document.title}`,
    description: "مراجعة البيانات والرسوم والرابط الرسمي قبل التجديد أو الدفع.",
    status: governance.allowedToExecute ? "READY" : "WAITING_APPROVAL",
    execution_mode: "GOVERNMENT_PORTAL_PREPARATION",
    provider: document.issuer || feeSource?.issuer || "Government portal",
    requires_approval: governance.requiresApproval,
    approval_status: governance.approvalStatus,
    payload: { governed_entity_id: document.id, document, task, feeSource, governance },
  }).select().single();
  if (actionError) throw actionError;

  await logDecision({
    decisionType: "GOVERNMENT_RENEWAL_PLAN_CREATED",
    entityType: "gov_documents",
    entityId: document.id,
    actorRole: "Government Relations Manager",
    action: `Prepared government renewal plan for ${document.title}`,
    amount,
    riskLevel: document.status === "EXPIRED" ? "HIGH" : "LOW",
    approvalStatus: governance.approvalStatus,
    metadata: { task, action },
  });

  return { document, task, action, feeSource, governance };
}

export async function prepareDigitalRenewal(documentId: string) {
  const plan = await createGovernmentRenewalPlan(documentId);
  const supabase = requireSupabase();
  const connected = await supabase
    .from("business_integrations")
    .select("*")
    .like("id", "gov-%")
    .eq("status", "CONNECTED");
  if (connected.error) throw connected.error;

  const ready = Boolean(connected.data?.length);
  const status = ready ? "READY_FOR_AUTOMATED_SUBMISSION" : "PENDING_PORTAL_AUTHORIZATION";
  await supabase.from("gov_renewal_tasks").update({ status }).eq("id", plan.task.id);

  await logDecision({
    decisionType: "GOVERNMENT_DIGITAL_RENEWAL_PREPARED",
    entityType: "gov_documents",
    entityId: documentId,
    actorRole: "Government Relations Manager",
    action: ready
      ? "Digital renewal is ready once portal-specific submission connector is enabled."
      : "Digital renewal requires official portal authorization/Nafath or government API connection before automatic submission.",
    approvalStatus: status,
    metadata: { connectedPortals: connected.data || [], plan },
  });

  return {
    ...plan,
    digitalRenewal: {
      status,
      canSubmitAutomaticallyNow: false,
      reason: ready
        ? "Portal credentials are connected, but final submission should be implemented per official API or approved browser automation connector."
        : "Government portals require authorized login, payment approval, and sometimes Nafath confirmation.",
      nextStep: ready
        ? "Enable the portal-specific connector and map required form fields."
        : "Connect Nafath/government portal credentials or official API access, then rerun preparation.",
    },
  };
}

export async function createGovernmentDocumentPreview(fileId: string, actorRole = "Government Relations Manager") {
  if (!fileId) throw new Error("Document file id is required.");
  await seedGovernmentRelationsOS();
  const supabase = requireSupabase();
  const { data: file, error } = await supabase.from("gov_document_files").select("*").eq("id", fileId).single();
  if (error) throw error;
  const signed = await supabase.storage.from(file.storage_bucket || "government-documents").createSignedUrl(file.storage_path, 60 * 10);
  if (signed.error) throw signed.error;
  await supabase.from("gov_document_access_logs").insert({
    document_id: file.document_id,
    file_id: file.id,
    actor_role: actorRole,
    action: "PREVIEW",
    metadata: { file_name: file.file_name, mime_type: file.mime_type },
  });
  return { file, signedUrl: signed.data.signedUrl, expiresInSeconds: 600 };
}
