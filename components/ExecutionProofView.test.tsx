import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExecutionProofView from "./ExecutionProofView";

const PROOF = "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e";
const SIGNED = "https://project.supabase.test/storage/v1/object/sign/execution-proofs/golden-star/t1/p/n.pdf?token=short";
const company = { legalName: "شركة النجمة الذهبية", approvedFundingSAR: null, today: "2026-10-20" };
const reading = (over: Record<string, unknown> = {}) => ({ status: "READ", engine: "openai", model: "test-model", latencyMs: 10, error: null, governmentType: null, facts: {}, ...over });
const file = (id: string, fileName: string, sizeBytes: number, readingOver: Record<string, unknown> = {}) => ({
  id, fileName, mimeType: "application/pdf", sizeBytes, sha256: "0123456789abcdef".repeat(4), reading: reading(readingOver), createdAt: "2026-10-20T08:00:00Z",
});
const sealed = {
  id: PROOF,
  taskId: "t1",
  sealed: true,
  note: "صدر السجل التجاري عبر منصة الأعمال",
  confirmedAt: "2026-10-20T09:00:00Z",
  files: [
    file("f1", "السجل التجاري.pdf", 4096, { governmentType: "COMMERCIAL_REGISTRATION", facts: { documentKind: { value: "سجل تجاري", confidence: 0.92 } } }),
    file("f2", "إيصال الرسوم.png", 2 * 1024 * 1024, { governmentType: null }),
  ],
  merged: {
    reference: { value: "1010123456", confidence: 0.82, fileId: "f1" },
    issuer: { value: "وزارة التجارة", confidence: 0.9, fileId: "f1" },
  },
  attested: { reference: "1010999999", issuer: "وزارة التجارة" },
  flags: [],
  company,
  readingEnabled: true,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function server(options: { track?: { code: number; body: unknown } } = {}) {
  const posts: any[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === `/api/tasks/proof?proofId=${PROOF}`) return json({ ok: true, proof: sealed });
    const body = JSON.parse(String(init?.body));
    posts.push(body);
    if (body.action === "open") return json({ ok: true, url: SIGNED, expiresInSeconds: 60 });
    if (body.action === "track") return json(options.track?.body ?? { ok: true, documentId: "gov-1", alreadyTracked: false }, options.track?.code ?? 200);
    throw new Error(`unexpected ${url}`);
  }));
  return posts;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExecutionProofView", () => {
  it("shows the note, the attested facts, and marks a fact the model read differently", async () => {
    server();
    render(<ExecutionProofView proofId={PROOF} />);
    expect(await screen.findByText("صدر السجل التجاري عبر منصة الأعمال")).toBeTruthy();
    expect(screen.getByText("1010999999")).toBeTruthy();
    expect(screen.getByText("قُرئ آلياً: 1010123456")).toBeTruthy();
    expect(screen.getByText("وزارة التجارة")).toBeTruthy();
    expect(screen.queryByText("قُرئ آلياً: وزارة التجارة")).toBeNull();
  });

  it("lists each file with its size and the start of its fingerprint, and no storage link", async () => {
    server();
    const { container } = render(<ExecutionProofView proofId={PROOF} />);
    expect(await screen.findByText("السجل التجاري.pdf")).toBeTruthy();
    expect(screen.getByText("إيصال الرسوم.png")).toBeTruthy();
    expect(screen.getByText("4 كيلوبايت")).toBeTruthy();
    expect(screen.getByText("2 ميجابايت")).toBeTruthy();
    expect(screen.getAllByText("0123456789ab")).toHaveLength(2);
    expect(container.querySelector('a[href*="storage"], a[href*="supabase"]')).toBeNull();
    expect(container.innerHTML).not.toContain("execution-proofs");
  });

  it("opens a file through a link signed only on the click, with the opener cut", async () => {
    const posts = server();
    const tab = { opener: {} as unknown, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal("open", open);
    render(<ExecutionProofView proofId={PROOF} />);
    await screen.findByText("السجل التجاري.pdf");
    fireEvent.click(screen.getByRole("button", { name: "فتح السجل التجاري.pdf" }));
    await waitFor(() => expect(tab.location.replace).toHaveBeenCalledWith(SIGNED));
    expect(posts).toEqual([{ action: "open", fileId: "f1" }]);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(tab.opener).toBeNull();
  });

  it("falls back to a plain noopener tab when the browser gave no window", async () => {
    server();
    const open = vi.fn(() => null);
    vi.stubGlobal("open", open);
    render(<ExecutionProofView proofId={PROOF} />);
    await screen.findByText("السجل التجاري.pdf");
    fireEvent.click(screen.getByRole("button", { name: "فتح إيصال الرسوم.png" }));
    await waitFor(() => expect(open).toHaveBeenLastCalledWith(SIGNED, "_blank", "noopener"));
  });

  it("offers Government Relations only for a file read as a government document, and reports the result", async () => {
    const posts = server();
    render(<ExecutionProofView proofId={PROOF} />);
    await screen.findByText("السجل التجاري.pdf");
    const offers = screen.getAllByRole("button", { name: "تتبّعها في العلاقات الحكومية" });
    expect(offers).toHaveLength(1);
    fireEvent.click(offers[0]);
    expect(await screen.findByText(/أُضيفت إلى/)).toBeTruthy();
    expect(posts).toEqual([{ action: "track", fileId: "f1" }]);
    expect(screen.getByRole("link", { name: "العلاقات الحكومية" }).getAttribute("href")).toBe("/departments/government-relations");
  });

  it("shows the Government Relations refusal in its own words", async () => {
    server({ track: { code: 400, body: { ok: false, message: "حجم الملف أكبر من 8 ميجابايت." } } });
    render(<ExecutionProofView proofId={PROOF} />);
    await screen.findByText("السجل التجاري.pdf");
    fireEvent.click(screen.getByRole("button", { name: "تتبّعها في العلاقات الحكومية" }));
    expect(await screen.findByText("حجم الملف أكبر من 8 ميجابايت.")).toBeTruthy();
  });
});
