/**
 * The browser's part of an execution proof: one file to its signed upload URL.
 *
 * The same request uploadToSignedUrl in @supabase/storage-js sends, without a
 * Supabase client or any key in the browser: the token in the URL, handed out
 * by the server after the session check, is the only credential.
 */

const MESSAGES = {
  tooLarge: "الحد الأعلى للملف 20 ميجابايت.",
  wrongType: "المقبول: PDF أو صورة JPEG أو PNG أو WEBP.",
  dropped: "انقطع الاتصال أثناء رفع الملف. أعد المحاولة.",
};

export async function uploadToProofSlot(slot: { signedUrl: string }, file: File): Promise<void> {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  let response: Response;
  try {
    response = await fetch(slot.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
  } catch {
    throw new Error(MESSAGES.dropped);
  }
  if (response.ok) return;
  // Storage reports some refusals as 400 with the real code in the body.
  const detail = (await response.json().catch(() => null)) as { statusCode?: string; error?: string } | null;
  const code = String(detail?.statusCode || response.status);
  if (code === "413") throw new Error(MESSAGES.tooLarge);
  if (code === "415" || detail?.error === "invalid_mime_type") throw new Error(MESSAGES.wrongType);
  throw new Error(`رفض المخزن الملف (رمز ${response.status}). أعد المحاولة.`);
}

/**
 * Opens a proof file through a 60-second link the server signs after its
 * session check. The tab opens inside the click, before the link exists,
 * because phone browsers block a tab opened after an await.
 */
export async function openProofFileInNewTab(fileId: string): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const response = await fetch("/api/tasks/proof", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "open", fileId }),
    });
    const json = (await response.json().catch(() => null)) as { ok?: boolean; url?: unknown; message?: string } | null;
    if (!response.ok || !json?.ok || typeof json.url !== "string") throw new Error(json?.message || "تعذر فتح الملف.");
    if (tab) {
      tab.opener = null;
      tab.location.replace(json.url);
    } else {
      window.open(json.url, "_blank", "noopener");
    }
  } catch (error) {
    tab?.close();
    throw new Error(error instanceof Error && error.message !== "Failed to fetch" ? error.message : "تعذر فتح الملف.");
  }
}
