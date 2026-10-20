import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ExecutionProofForm from "./ExecutionProofForm";

const PROOF = "7b0c2a52-8a3c-4c7e-9a7f-6f4d3b2a1c0e";
const notRead = { status: "NOT_READ", engine: "none", model: null, latencyMs: 0, error: null, governmentType: null, facts: {} };
const company = { legalName: "شركة النجمة الذهبية", approvedFundingSAR: 4500, today: "2026-10-20" };

type View = Record<string, any>;
const view = (over: View = {}): View => ({ id: PROOF, taskId: "t1", sealed: false, note: null, confirmedAt: null, files: [], merged: {}, attested: null, flags: [], company, readingEnabled: false, ...over });
const fileView = (id: string, fileName: string, sizeBytes: number, reading: View = notRead) => ({ id, fileName, mimeType: "application/pdf", sizeBytes, sha256: "ab12".repeat(16), reading, createdAt: "2026-10-20T08:00:00Z" });
const pdf = (name: string, size = 2048) => new File([new Uint8Array(size).fill(0x25)], name, { type: "application/pdf" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Call = { url: string; method: string; body: any };

/** The proof API, the signed upload URL and the status API, in memory. */
function server(options: { draft?: View | null; startStatus?: number; uploadStatus?: number; status?: { code: number; body: unknown }; holdUpload?: Promise<void> } = {}) {
  let current: View | null = options.draft ?? null;
  const calls: Call[] = [];
  const sizes = new Map<string, number>();
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ url, method, body });
    if (url.startsWith("/api/tasks/proof?taskId=")) return json({ ok: true, proof: current });
    if (url.startsWith("https://storage.test/")) {
      await options.holdUpload;
      return options.uploadStatus ? new Response("bad gateway", { status: options.uploadStatus }) : json({ Key: url }, 200);
    }
    if (url === "/api/tasks/proof" && body.action === "start") {
      if (options.startStatus) return json({ ok: false, code: "NOT_CONFIGURED", message: "قاعدة البيانات غير مهيأة. لم يُحفظ شيء." }, options.startStatus);
      current = current ?? view();
      return json({ ok: true, proof: current });
    }
    if (url === "/api/tasks/proof" && body.action === "slot") {
      sizes.set(body.fileName, body.sizeBytes);
      return json({ ok: true, path: `golden-star/t1/${PROOF}/${body.fileName.length}.pdf`, token: "t", signedUrl: `https://storage.test/upload/${encodeURIComponent(body.fileName)}?token=t` });
    }
    if (url === "/api/tasks/proof" && body.action === "remove") {
      const merged = Object.fromEntries(Object.entries(current!.merged).filter(([, fact]: [string, any]) => fact.fileId !== body.fileId));
      current = { ...current!, merged, files: current!.files.filter((file: View) => file.id !== body.fileId) };
      return json({ ok: true, proof: current });
    }
    if (url === "/api/tasks/proof" && body.action === "register") {
      current = { ...current!, files: [...current!.files, fileView(`f${current!.files.length + 1}`, body.fileName, sizes.get(body.fileName) ?? 0)] };
      return json({ ok: true, proof: current });
    }
    if (url === "/api/tasks/status") return json(options.status?.body ?? { ok: true, task: { id: "t1", status: "DONE" } }, options.status?.code ?? 200);
    throw new Error(`unexpected request ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const actions = (name: string) => calls.filter((call) => call.body?.action === name);
  const statusBody = () => calls.find((call) => call.url === "/api/tasks/status")?.body;
  return { calls, actions, statusBody };
}

const choose = (...files: File[]) => fireEvent.change(screen.getByLabelText("إرفاق مستند"), { target: { files } });
const writeNote = (text = "صدر السجل التجاري عبر منصة الأعمال اليوم") => fireEvent.change(screen.getByLabelText("الإثبات: ماذا تم فعلياً، ومتى، وأين يمكن التحقق منه؟"), { target: { value: text } });
const confirmButton = () => screen.getByRole("button", { name: "تسجيل التأكيد" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExecutionProofForm", () => {
  it("confirms with the note alone, as before, when no document is attached", async () => {
    const api = server();
    const onConfirmed = vi.fn();
    render(<ExecutionProofForm taskId="t1" onConfirmed={onConfirmed} />);
    expect(screen.getByText(/بلا مستند/)).toBeTruthy();
    writeNote();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
    expect(api.statusBody()).toEqual({ id: "t1", confirmReal: true, proofNote: "صدر السجل التجاري عبر منصة الأعمال اليوم" });
    expect(api.actions("start")).toHaveLength(0);
  });

  it("asks for a note of ten characters before sending anything", async () => {
    const api = server();
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    writeNote("قصير");
    fireEvent.click(confirmButton());
    expect(await screen.findByText(/لا يقل عن 10 أحرف/)).toBeTruthy();
    expect(api.statusBody()).toBeUndefined();
  });

  it("uploads two documents through one draft and lists both with their size", async () => {
    const api = server();
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    choose(pdf("السجل التجاري.pdf", 2048), pdf("إيصال الرسوم.pdf", 3 * 1024 * 1024));
    await waitFor(() => expect(screen.getAllByText("لم تُقرأ البيانات آلياً")).toHaveLength(2));
    expect(screen.getByText("إيصال الرسوم.pdf")).toBeTruthy();
    expect(screen.getByText("السجل التجاري.pdf")).toBeTruthy();
    expect(screen.getByText(/2 كيلوبايت/)).toBeTruthy();
    expect(screen.getByText(/3 ميجابايت/)).toBeTruthy();
    expect(api.actions("start")).toHaveLength(1);
    expect(api.actions("slot")).toHaveLength(2);
    expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(2);
    expect(api.actions("register").map((call) => call.body.fileName)).toEqual(["السجل التجاري.pdf", "إيصال الرسوم.pdf"]);
  });

  it("refuses an oversize file and a foreign type in the browser, uploading neither", async () => {
    const api = server();
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    const big = pdf("مسح كامل.pdf", 10);
    Object.defineProperty(big, "size", { value: 20 * 1024 * 1024 + 1 });
    const word = new File(["x"], "عقد.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    choose(big, word);
    expect(await screen.findByText(/الحد الأعلى للملف 20 ميجابايت/)).toBeTruthy();
    expect(screen.getByText(/المقبول: PDF أو صورة/)).toBeTruthy();
    expect(api.calls.filter((call) => call.url.startsWith("/api/tasks/proof") && call.method === "POST")).toHaveLength(0);
    expect(api.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("keeps Confirm disabled while a document is still uploading", async () => {
    let release!: () => void;
    server({ holdUpload: new Promise<void>((resolve) => { release = resolve; }) });
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    writeNote();
    choose(pdf("صورة الإيصال.pdf"));
    await waitFor(() => expect((confirmButton() as HTMLButtonElement).disabled).toBe(true));
    release();
    await screen.findByText("صورة الإيصال.pdf");
    await waitFor(() => expect((confirmButton() as HTMLButtonElement).disabled).toBe(false));
  });

  it("shows what was read, from which file and how sure, and seals the owner's corrections", async () => {
    const reading = { ...notRead, status: "READ", engine: "openai", model: "test-model", facts: { reference: { value: "1010123456", confidence: 0.82 } } };
    const api = server({
      draft: view({
        readingEnabled: true,
        files: [fileView("f1", "السجل.pdf", 4096, reading)],
        merged: { reference: { value: "1010123456", confidence: 0.82, fileId: "f1" } },
      }),
    });
    const onConfirmed = vi.fn();
    render(<ExecutionProofForm taskId="t1" onConfirmed={onConfirmed} />);
    const reference = (await screen.findByLabelText("رقم المستند أو المرجع")) as HTMLInputElement;
    expect(reference.value).toBe("1010123456");
    expect(screen.getByText("قُرئ من «السجل.pdf» بثقة 82%")).toBeTruthy();
    fireEvent.change(reference, { target: { value: "1010999999" } });
    fireEvent.change(screen.getByLabelText("الجهة المصدرة"), { target: { value: "وزارة التجارة" } });
    writeNote();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(api.statusBody()).toMatchObject({
      id: "t1",
      confirmReal: true,
      proofId: PROOF,
      attestedFacts: { reference: "1010999999", issuer: "وزارة التجارة" },
    });
  });

  it("warns when the document disagrees with the company, and still lets the owner confirm", async () => {
    server({ draft: view({ files: [fileView("f1", "عقد.pdf", 4096)] }) });
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("صاحب المستند أو أطرافه"), { target: { value: "مؤسسة أخرى للتجارة" } });
    fireEvent.change(screen.getByLabelText("المبلغ"), { target: { value: "٥٬٠٠٠" } });
    expect(screen.getByText(/لا يطابق اسم الشركة المسجل/)).toBeTruthy();
    expect(screen.getByText(/يختلف عن التمويل المعتمد/)).toBeTruthy();
    writeNote();
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows a returning owner the documents already attached, and adds to that same draft", async () => {
    const api = server({ draft: view({ files: [fileView("f1", "مرفق سابق.pdf", 4096)] }) });
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    expect(await screen.findByText("مرفق سابق.pdf")).toBeTruthy();
    choose(pdf("مرفق جديد.pdf"));
    expect(await screen.findByText("مرفق جديد.pdf")).toBeTruthy();
    await waitFor(() => expect(api.actions("register")).toHaveLength(1));
    expect(api.actions("start")).toHaveLength(0);
    expect(api.actions("register")[0].body.proofId).toBe(PROOF);
  });

  it("takes a wrongly attached document out before confirming, with what was read from it", async () => {
    const api = server({
      draft: view({
        readingEnabled: true,
        files: [fileView("f1", "ملف خاطئ.pdf", 4096, { ...notRead, status: "READ", facts: { reference: { value: "999", confidence: 0.9 } } }), fileView("f2", "السجل.pdf", 4096)],
        merged: { reference: { value: "999", confidence: 0.9, fileId: "f1" } },
      }),
    });
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    expect(((await screen.findByLabelText("رقم المستند أو المرجع")) as HTMLInputElement).value).toBe("999");
    fireEvent.click(screen.getByRole("button", { name: "إزالة ملف خاطئ.pdf" }));
    await waitFor(() => expect(screen.queryByText("ملف خاطئ.pdf")).toBeNull());
    expect(screen.getByText("السجل.pdf")).toBeTruthy();
    expect((screen.getByLabelText("رقم المستند أو المرجع") as HTMLInputElement).value).toBe("");
    expect(api.actions("remove")).toEqual([{ url: "/api/tasks/proof", method: "POST", body: { action: "remove", fileId: "f1" } }]);
  });

  it("confirms by the note alone when the only upload failed, since a proof needs a file", async () => {
    const api = server({ uploadStatus: 502 });
    render(<ExecutionProofForm taskId="t1" onConfirmed={vi.fn()} />);
    choose(pdf("السجل.pdf"));
    expect(await screen.findByText(/رفض المخزن الملف \(رمز 502\)/)).toBeTruthy();
    writeNote();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.statusBody()).toBeTruthy());
    expect(api.statusBody()).not.toHaveProperty("proofId");
    expect(api.actions("start")).toHaveLength(1);
  });

  it("says so when the store is down, and still allows the note alone", async () => {
    const api = server({ startStatus: 503 });
    const onConfirmed = vi.fn();
    render(<ExecutionProofForm taskId="t1" onConfirmed={onConfirmed} />);
    choose(pdf("السجل.pdf"));
    expect(await screen.findByText(/قاعدة البيانات غير مهيأة/)).toBeTruthy();
    writeNote();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(api.statusBody()).not.toHaveProperty("proofId");
  });

  it("shows the server's own words when the proof was sealed elsewhere", async () => {
    server({ draft: view({ files: [fileView("f1", "عقد.pdf", 4096)] }), status: { code: 409, body: { ok: false, code: "PROOF_ALREADY_SEALED", message: "سُجّل هذا الإثبات وخُتم من قبل. لم يتغير شيء." } } });
    const onConfirmed = vi.fn();
    render(<ExecutionProofForm taskId="t1" onConfirmed={onConfirmed} />);
    await screen.findByText("عقد.pdf");
    writeNote();
    fireEvent.click(confirmButton());
    expect(await screen.findByText("سُجّل هذا الإثبات وخُتم من قبل. لم يتغير شيء.")).toBeTruthy();
    expect(onConfirmed).not.toHaveBeenCalled();
  });
});
