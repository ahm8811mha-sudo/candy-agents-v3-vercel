import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/supabase", () => ({ persist: vi.fn() }));

import {
  compareWithCompany,
  mergeReadings,
  normalizeAmount,
  normalizeDate,
  proofReadingEnabled,
  readProofFile,
  type ProofReading,
} from "@/lib/executionProofs/reading";

const saved = { ...process.env };
const pdf = { bytes: new Uint8Array(Buffer.from("%PDF-1.7 test")), mime: "application/pdf" as const, fileName: "registration.pdf" };
const answer = (body: unknown) => new Response(JSON.stringify({ output_text: JSON.stringify(body), usage: { input_tokens: 900, output_tokens: 120 } }), { status: 200 });

beforeEach(() => { delete process.env.ORVANTA_PROOF_READING; delete process.env.OPENAI_API_KEY; });
afterEach(() => { process.env = { ...saved }; vi.restoreAllMocks(); });

describe("proofReadingEnabled", () => {
  // Owner decision 2026-10-20: no document leaves the country until a
  // provider processing inside the Kingdom is chosen.
  it("is off unless the owner has turned it on and a key exists", () => {
    expect(proofReadingEnabled({})).toBe(false);
    expect(proofReadingEnabled({ OPENAI_API_KEY: "x" })).toBe(false);
    expect(proofReadingEnabled({ ORVANTA_PROOF_READING: "openai" })).toBe(false);
    expect(proofReadingEnabled({ ORVANTA_PROOF_READING: "openai", OPENAI_API_KEY: "x" })).toBe(true);
  });
});

describe("readProofFile", () => {
  it("sends nothing anywhere while reading is off", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const reading = await readProofFile(pdf);
    expect(reading).toMatchObject({ status: "NOT_READ", engine: "none", facts: {} });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalises what the model read: digits, amounts, dates, confidence, type", async () => {
    process.env.ORVANTA_PROOF_READING = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(answer({
      documentKind: { value: "سجل تجاري", confidence: 1.4 },
      reference: { value: "١٠١٠٢٣", confidence: 0.92 },
      issuer: { value: "وزارة التجارة", confidence: 0.9 },
      parties: { value: "شركة النجمة الذهبية", confidence: 0.88 },
      issueDate: { value: "١٤٤٧/٠٣/١٢", confidence: 0.8 },
      expiryDate: { value: "2027-03-01", confidence: 0.85 },
      amount: { value: "٤٬٥٠٠٫٠٠ ر.س", confidence: 0.7 },
      currency: { value: "SAR", confidence: -2 },
      governmentType: "COMMERCIAL_REGISTRATION",
    }));
    const reading = await readProofFile(pdf);
    expect(reading.status).toBe("READ");
    expect(reading.facts.documentKind?.confidence).toBe(1);
    expect(reading.facts.reference?.value).toBe("101023");
    expect(reading.facts.amount?.value).toBe("4500.00");
    expect(reading.facts.issueDate).toBeUndefined(); // a Hijri date is never taken for a Gregorian one
    expect(reading.facts.expiryDate?.value).toBe("2027-03-01");
    expect(reading.facts.currency?.confidence).toBe(0);
    expect(reading.governmentType).toBe("COMMERCIAL_REGISTRATION");
  });

  it("drops a government type it does not know", async () => {
    process.env.ORVANTA_PROOF_READING = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(answer({ governmentType: "PASSPORT" }));
    expect((await readProofFile(pdf)).governmentType).toBeNull();
  });

  it("reports a failed reading without throwing, so the owner can still confirm", async () => {
    process.env.ORVANTA_PROOF_READING = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    const reading = await readProofFile(pdf);
    expect(reading).toMatchObject({ status: "FAILED", facts: {} });
    expect(reading.error).toContain("fetch failed");
  });
});

describe("normalisation", () => {
  it("reads amounts in either digit system and drops separators and currency", () => {
    expect(normalizeAmount("٤٬٥٠٠٫٠٠ ر.س")).toBe("4500.00");
    expect(normalizeAmount("SAR 12,750.5")).toBe("12750.5");
    expect(normalizeAmount("ريال")).toBe("");
  });

  it("keeps only unambiguous Gregorian dates", () => {
    expect(normalizeDate("2027-03-01")).toBe("2027-03-01");
    expect(normalizeDate("٢٠٢٧/٠٣/٠١")).toBe("2027-03-01");
    expect(normalizeDate("1447-03-12")).toBe("");
    expect(normalizeDate("2027-03-01 هـ")).toBe("");
    expect(normalizeDate("01/03/2027")).toBe("");
    expect(normalizeDate("2027-02-30")).toBe("");
  });
});

describe("mergeReadings", () => {
  it("keeps, per fact, the most confident value and the file it came from", () => {
    const read = (facts: ProofReading["facts"]): ProofReading => ({ status: "READ", engine: "openai", model: "m", latencyMs: 1, error: null, governmentType: null, facts });
    const merged = mergeReadings([
      { id: "f1", reading: read({ reference: { value: "1010", confidence: 0.6 }, issuer: { value: "", confidence: 0.99 } }) },
      { id: "f2", reading: read({ reference: { value: "1011", confidence: 0.9 }, issuer: { value: "وزارة التجارة", confidence: 0.5 } }) },
    ]);
    expect(merged.reference).toEqual({ value: "1011", confidence: 0.9, fileId: "f2" });
    expect(merged.issuer).toEqual({ value: "وزارة التجارة", confidence: 0.5, fileId: "f2" });
  });
});

describe("compareWithCompany", () => {
  const company = { legalName: "شركة النجمة الذهبية", approvedFundingSAR: 4500, today: "2026-10-20" };

  it("matches the company name across Arabic spelling variants", () => {
    expect(compareWithCompany({ parties: "شركة النجمه الذهبيه" }, company)).toEqual([]);
    expect(compareWithCompany({ parties: "شـركة النَّجمة الذهبية للتجارة" }, company)).toEqual([]);
    expect(compareWithCompany({ parties: "مؤسسة الأفق" }, company)).toEqual([{ code: "HOLDER_NOT_COMPANY", fact: "parties" }]);
    expect(compareWithCompany({ parties: "مؤسسة الأفق" }, { ...company, legalName: null })).toEqual([]);
  });

  it("flags an expired document", () => {
    expect(compareWithCompany({ expiryDate: "2026-10-19" }, company)).toEqual([{ code: "EXPIRED", fact: "expiryDate" }]);
    expect(compareWithCompany({ expiryDate: "2026-10-20" }, company)).toEqual([]);
  });

  it("flags a paid amount that differs from the approved funding by more than 1%", () => {
    expect(compareWithCompany({ amount: "4500.4" }, company)).toEqual([]);
    expect(compareWithCompany({ amount: "5000" }, company)).toEqual([{ code: "AMOUNT_DIFFERS", fact: "amount" }]);
    expect(compareWithCompany({ amount: "4500", currency: "USD" }, company)).toEqual([{ code: "AMOUNT_DIFFERS", fact: "amount" }]);
    expect(compareWithCompany({ amount: "4500", currency: "ر.س" }, company)).toEqual([]);
    expect(compareWithCompany({ amount: "5000" }, { ...company, approvedFundingSAR: null })).toEqual([]);
  });
});
