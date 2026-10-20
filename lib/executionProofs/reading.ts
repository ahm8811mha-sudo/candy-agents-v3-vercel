/**
 * Reading a proof, and merging what its files said. The comparison with the
 * company's records lives in facts.ts, which the browser shares.
 *
 * Everything here is advice for the owner. Nothing in this module changes a
 * task; only the owner's confirmation does, through the database. Reading is
 * off unless the owner has allowed a provider (ORVANTA_PROOF_READING), so by
 * default no document leaves the system: the file is stored and fingerprinted
 * and the owner enters the facts.
 */

import { callOpenAIResponses, type ResponsesInput } from "../ai/openai";
import { extractJsonBlock } from "../aiStructured";
import { isGovernmentDocumentType, type GovernmentDocumentType } from "../governmentDocumentTypes";
import { PROOF_FACT_KEYS, normalizeAmount, normalizeDate, normalizeDigits, type MergedFacts, type ProofFactKey, type ReadFact } from "./facts";
import type { ProofMime } from "./rules";

export {
  PROOF_FACT_KEYS,
  compareWithCompany,
  normalizeAmount,
  normalizeDate,
  normalizeDigits,
  type AttestedFacts,
  type MergedFacts,
  type ProofFactKey,
  type ProofFlag,
  type ReadFact,
} from "./facts";

export type ProofReading = {
  status: "READ" | "NOT_READ" | "FAILED";
  engine: "openai" | "none";
  model: string | null;
  latencyMs: number;
  error: string | null;
  governmentType: GovernmentDocumentType | null;
  facts: Partial<Record<ProofFactKey, ReadFact>>;
};

export function proofReadingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.ORVANTA_PROOF_READING === "openai" && Boolean(env.OPENAI_API_KEY);
}

export function notRead(): ProofReading {
  return { status: "NOT_READ", engine: "none", model: null, latencyMs: 0, error: null, governmentType: null, facts: {} };
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

function normalizeFact(key: ProofFactKey, raw: unknown): ReadFact | null {
  const entry = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : { value: raw };
  const text = cleanText(entry.value);
  const value =
    key === "amount" ? normalizeAmount(text)
      : key === "issueDate" || key === "expiryDate" ? normalizeDate(text)
        : key === "reference" ? normalizeDigits(text)
          : text;
  if (!value) return null;
  const confidence = Number(entry.confidence);
  return { value, confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0 };
}

const PROMPT = `اقرأ المستند المرفق، وهو إثبات تنفيذ لخطوة فعلية في شركة: سجل أو ترخيص أو إيصال دفع أو عقد أو خطاب بنكي.
استخرج فقط ما يظهر فعلاً في المستند. لا تخمّن ولا تكمل قيمة غير ظاهرة.
لا تستخرج رقم الهوية الوطنية أو الإقامة أو أي بيانات دخول.
أعد كائن JSON واحداً فقط بهذه البنية، وكل حقل غير ظاهر اتركه بقيمة فارغة:
{
  "documentKind": {"value": "نوع المستند بالعربية", "confidence": 0.0},
  "reference": {"value": "رقم المستند أو المرجع كما يظهر", "confidence": 0.0},
  "issuer": {"value": "الجهة المصدرة", "confidence": 0.0},
  "parties": {"value": "اسم صاحب المستند أو أطرافه", "confidence": 0.0},
  "issueDate": {"value": "تاريخ الإصدار كما يظهر", "confidence": 0.0},
  "expiryDate": {"value": "تاريخ الانتهاء كما يظهر", "confidence": 0.0},
  "amount": {"value": "المبلغ المدفوع كما يظهر", "confidence": 0.0},
  "currency": {"value": "العملة", "confidence": 0.0},
  "governmentType": "COMMERCIAL_REGISTRATION أو VAT_CERTIFICATE أو ZAKAT_TAX_CERTIFICATE أو CHAMBER_SUBSCRIPTION أو MUNICIPAL_LICENSE أو WORK_PERMIT أو INVESTMENT_LICENSE أو OTHER_GOVERNMENT_DOCUMENT إن كان وثيقة حكومية سعودية، وإلا null"
}
اكتب التواريخ كما تظهر، واذكر إن كانت هجرية.`;

export async function readProofFile(file: { bytes: Uint8Array; mime: ProofMime; fileName: string }): Promise<ProofReading> {
  if (!proofReadingEnabled()) return notRead();
  const model = process.env.OPENAI_DOCUMENT_MODEL || "gpt-4.1-mini";
  const started = Date.now();
  const dataUrl = `data:${file.mime};base64,${Buffer.from(file.bytes).toString("base64")}`;
  const content: ResponsesInput = [
    file.mime === "application/pdf"
      ? { type: "input_file", filename: file.fileName, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" },
    { type: "input_text", text: PROMPT },
  ];
  try {
    const result = await callOpenAIResponses({ agentName: "execution-proof", model, content, timeoutMs: 55_000 });
    const block = extractJsonBlock(result.text);
    const parsed = (block ? JSON.parse(block) : {}) as Record<string, unknown>;
    const facts: ProofReading["facts"] = {};
    for (const key of PROOF_FACT_KEYS) {
      const fact = normalizeFact(key, parsed[key]);
      if (fact) facts[key] = fact;
    }
    return {
      status: "READ",
      engine: "openai",
      model,
      latencyMs: result.latencyMs,
      error: null,
      governmentType: isGovernmentDocumentType(parsed.governmentType) ? parsed.governmentType : null,
      facts,
    };
  } catch (error) {
    return {
      status: "FAILED",
      engine: "openai",
      model,
      latencyMs: Date.now() - started,
      error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      governmentType: null,
      facts: {},
    };
  }
}

/** Per fact, the most confident non-empty value, and the file it came from. */
export function mergeReadings(files: Array<{ id: string; reading: ProofReading }>): MergedFacts {
  const merged: MergedFacts = {};
  for (const { id, reading } of files) {
    for (const key of PROOF_FACT_KEYS) {
      const fact = reading.facts[key];
      if (!fact?.value) continue;
      const current = merged[key];
      if (!current || fact.confidence > current.confidence) merged[key] = { ...fact, fileId: id };
    }
  }
  return merged;
}
