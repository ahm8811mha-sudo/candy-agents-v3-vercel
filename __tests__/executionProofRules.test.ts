import { describe, expect, it } from "vitest";
import {
  MAX_PROOF_FILE_BYTES,
  ProofError,
  checkDeclaredFile,
  isPathOfProof,
  proofObjectPath,
  sniffProofMime,
} from "@/lib/executionProofs/rules";

const bytes = (...values: Array<number | string>) =>
  new Uint8Array(values.flatMap((value) => (typeof value === "string" ? [...Buffer.from(value)] : [value])));

describe("sniffProofMime", () => {
  it("reads the type from the bytes, never from the name", () => {
    expect(sniffProofMime(bytes("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffProofMime(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe("image/png");
    expect(sniffProofMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10))).toBe("image/jpeg");
    expect(sniffProofMime(bytes("RIFF", 0x24, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses anything else, including look-alikes", () => {
    expect(sniffProofMime(bytes("<!doctype html><html>"))).toBeNull();
    expect(sniffProofMime(bytes("MZ", 0x90, 0))).toBeNull();
    expect(sniffProofMime(bytes("RIFF", 0x24, 0, 0, 0, "WAVEfmt "))).toBeNull();
    expect(sniffProofMime(new Uint8Array())).toBeNull();
  });
});

describe("checkDeclaredFile", () => {
  it("allows up to 20 MB of the four types", () => {
    expect(() => checkDeclaredFile({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: MAX_PROOF_FILE_BYTES })).not.toThrow();
    expect(() => checkDeclaredFile({ fileName: "a.webp", mimeType: "image/webp", sizeBytes: 1 })).not.toThrow();
  });

  it("refuses an empty file, an oversize file and another type, with the right status", () => {
    const error = (input: Parameters<typeof checkDeclaredFile>[0]) => {
      try { checkDeclaredFile(input); } catch (caught) { return caught as ProofError; }
      throw new Error("expected a refusal");
    };
    expect(error({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: 0 })).toMatchObject({ code: "INVALID_INPUT", status: 400 });
    expect(error({ fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: MAX_PROOF_FILE_BYTES + 1 })).toMatchObject({ code: "TOO_LARGE", status: 413 });
    expect(error({ fileName: "a.txt", mimeType: "text/plain", sizeBytes: 10 })).toMatchObject({ code: "UNSUPPORTED_TYPE", status: 415 });
  });
});

describe("object paths", () => {
  // Storage keys stay ASCII (Supabase refuses other characters in a key); the
  // original name, Arabic or not, is kept only in the database row.
  it("keeps every file of a proof under its tenant, task and proof, by type", () => {
    const path = proofObjectPath("Golden Star", "task/1", "p1", "application/pdf", "N1");
    expect(path).toBe("golden-star/task-1/p1/n1.pdf");
    expect(proofObjectPath("golden-star", "t", "p", "image/jpeg", "n")).toBe("golden-star/t/p/n.jpg");
    expect(isPathOfProof(path, "Golden Star", "task/1", "p1")).toBe(true);
  });

  it("rejects a path of another proof, task or tenant, or one that climbs", () => {
    expect(isPathOfProof("golden-star/task-1/p2/n1-x.pdf", "Golden Star", "task/1", "p1")).toBe(false);
    expect(isPathOfProof("golden-star/task-2/p1/n1-x.pdf", "Golden Star", "task/1", "p1")).toBe(false);
    expect(isPathOfProof("other/task-1/p1/n1-x.pdf", "Golden Star", "task/1", "p1")).toBe(false);
    expect(isPathOfProof("golden-star/task-1/p1/../p2/x.pdf", "Golden Star", "task/1", "p1")).toBe(false);
    expect(isPathOfProof("golden-star/task-1/p1/", "Golden Star", "task/1", "p1")).toBe(false);
  });
});
