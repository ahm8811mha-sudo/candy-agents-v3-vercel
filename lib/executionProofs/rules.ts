/**
 * What an execution proof may contain, and where its files live. Pure: no I/O.
 * The database enforces the same limits (20261018000200_execution_proofs.sql).
 * Government Relations takes documents through the same type and size rules.
 */

export const PROOF_BUCKET = "execution-proofs";
export const MAX_PROOF_FILES = 10;
export const MAX_PROOF_FILE_BYTES = 20 * 1024 * 1024;

export type ProofMime = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export const PROOF_MIME_TYPES: readonly ProofMime[] = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const EXTENSION: Record<ProofMime, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type ProofErrorCode =
  | "INVALID_INPUT"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SEALED"
  | "FILE_LIMIT"
  | "DUPLICATE_FILE"
  | "TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "GOVERNMENT_FAILED"
  | "NOT_CONFIGURED";

export class ProofError extends Error {
  constructor(
    public readonly code: ProofErrorCode,
    public readonly status: 400 | 403 | 404 | 409 | 413 | 415 | 503,
    message: string
  ) {
    super(message);
    this.name = "ProofError";
  }
}

export function mimeExtension(mime: ProofMime): string {
  return EXTENSION[mime];
}

export function isProofMime(value: string): value is ProofMime {
  return (PROOF_MIME_TYPES as readonly string[]).includes(value);
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((byte, index) => bytes[offset + index] === byte);

/** The type the bytes actually are. A declared type or a file name proves nothing. */
export function sniffProofMime(bytes: Uint8Array): ProofMime | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp"; // RIFF....WEBP
  return null;
}

/** The browser's declaration, checked before a slot is handed out. */
export function checkDeclaredFile(input: { fileName: string; mimeType: string; sizeBytes: number }): void {
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || !input.fileName.trim()) {
    throw new ProofError("INVALID_INPUT", 400, "الملف فارغ أو غير صالح.");
  }
  if (input.sizeBytes > MAX_PROOF_FILE_BYTES) {
    throw new ProofError("TOO_LARGE", 413, "الحد الأعلى للملف 20 ميجابايت.");
  }
  if (!isProofMime(input.mimeType)) {
    throw new ProofError("UNSUPPORTED_TYPE", 415, "المقبول: PDF أو صورة JPEG أو PNG أو WEBP.");
  }
}

/** Lowercase ASCII: storage keys accept nothing else reliably. */
export function safePathPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "x";
}

function proofPrefix(tenantId: string, taskId: string, proofId: string) {
  return `${safePathPart(tenantId)}/${safePathPart(taskId)}/${safePathPart(proofId)}/`;
}

export function proofObjectPath(tenantId: string, taskId: string, proofId: string, mime: ProofMime, nonce: string): string {
  return `${proofPrefix(tenantId, taskId, proofId)}${safePathPart(nonce)}.${EXTENSION[mime]}`;
}

/** True only for a file directly inside this proof's folder. */
export function isPathOfProof(path: string, tenantId: string, taskId: string, proofId: string): boolean {
  const prefix = proofPrefix(tenantId, taskId, proofId);
  if (!path.startsWith(prefix)) return false;
  return /^[a-z0-9_-]+\.(pdf|jpg|png|webp)$/.test(path.slice(prefix.length));
}
