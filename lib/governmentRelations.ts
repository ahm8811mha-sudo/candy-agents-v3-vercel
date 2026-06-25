import { evaluateGovernedAction, logDecision, seedGovernanceOS } from "./governanceOS";
import { getSupabaseAdmin } from "./supabase";

type GovernmentDocumentInput = {
  documentType?: string;
  title?: string;
  issuer?: string;
  fileName?: string;
  mimeType?: string;
  fileBase64?: string;
  fileText?: string;
  notes?: string;
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
  const res = await fetch(url, {
    headers: {
      "User-Agent": "CandyAgentsGovernmentRelations/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(7000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Official source returned ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 9000);
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

  const { error: departmentError } = await supabase.from("departments").upsert(
    {
      id: "government-relations",
      name: "إدارة العلاقات الحكومية",
      description: "حفظ الوثائق الحكومية، استخراج بياناتها، متابعة التجديد، ومراقبة الرسوم والبوابات الرسمية.",
    },
    { onConflict: "id" }
  );
  if (departmentError) throw departmentError;

  const { error: typeError } = await supabase.from("gov_document_types").upsert(
    catalog.map((item) => ({
      id: item.documentType,
      name: titleForDocumentType(item.documentType),
      issuer: item.issuer,
      official_url: item.officialUrl,
      renewal_url: item.renewalUrl,
      required_fields: requiredFieldsByType[item.documentType] || requiredFieldsByType.OTHER_GOVERNMENT_DOCUMENT,
      automation_level: item.documentType === "VAT_CERTIFICATE" ? "PORTAL_READY" : "PORTAL_PREPARATION",
      active: true,
    })),
    { onConflict: "id" }
  );
  if (typeError) throw typeError;

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
  const [types, documents, files, fees, tasks, integrations, auditRows] = await Promise.all([
    supabase.from("gov_document_types").select("*").order("name", { ascending: true }),
    supabase.from("gov_documents").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("gov_document_files").select("id, document_id, file_name, mime_type, file_size, created_at").order("created_at", { ascending: false }).limit(80),
    supabase.from("gov_fee_sources").select("*").order("document_type", { ascending: true }),
    supabase.from("gov_renewal_tasks").select("*").order("due_date", { ascending: true }).limit(80),
    supabase.from("business_integrations").select("*").like("id", "gov-%").order("provider", { ascending: true }),
    supabase.from("decision_audit_log").select("*").eq("entity_type", "gov_documents").order("created_at", { ascending: false }).limit(30),
  ]);

  for (const result of [types, documents, files, fees, tasks, integrations, auditRows]) {
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
    audits: auditRows.data || [],
    metrics: {
      totalDocuments: documentRows.length,
      activeDocuments: documentRows.filter((doc: any) => doc.status === "ACTIVE").length,
      expiringSoon,
      expired,
      missingData,
      totalEstimatedFees,
      readyPortals,
      lastCheckedSources: (fees.data || []).filter((item: any) => item.last_checked_at).length,
    },
  };
}

async function findFeeSource(documentType: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("gov_fee_sources").select("*").eq("document_type", documentType).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function createRenewalTask(document: any, feeSource: any) {
  const supabase = requireSupabase();
  const dueDate = document.renewal_date || renewalDateFor(document.expiry_date) || document.expiry_date || todayIso();
  const priority = document.status === "EXPIRED" || document.status === "RENEWAL_URGENT" ? "URGENT" : document.status === "RENEWAL_SOON" ? "HIGH" : "MEDIUM";
  const { data, error } = await supabase
    .from("gov_renewal_tasks")
    .upsert(
      {
        id: `renew-${document.id}`,
        document_id: document.id,
        task_type: "RENEWAL_PREPARATION",
        title: `تجهيز تجديد ${document.title || titleForDocumentType(document.document_type)}`,
        due_date: dueDate,
        priority,
        status: document.status === "ACTIVE" ? "SCHEDULED" : "OPEN",
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
    })
    .select()
    .single();
  if (documentError) throw documentError;

  if (input.fileName || input.fileBase64 || input.fileText) {
    const { error: fileError } = await supabase.from("gov_document_files").insert({
      document_id: document.id,
      file_name: input.fileName || "government-document",
      mime_type: input.mimeType || "application/octet-stream",
      file_size: Math.round(((input.fileBase64 || input.fileText || "").length * 3) / 4),
      file_payload: input.fileBase64 || null,
      text_payload: input.fileText || null,
    });
    if (fileError) throw fileError;
  }

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
    metadata: { document_id: document.id, status, missingFields: extracted.missingFields, task_id: task.id },
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

  return { document, extraction: extracted, task, feeSource, governance };
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
    metadata: { renewal_task_id: task.id, official_url: feeSource?.official_url, renewal_url: feeSource?.renewal_url },
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
    payload: { document, task, feeSource, governance },
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
