import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadToProofSlot } from "@/lib/executionProofs/client";

const slot = { signedUrl: "https://storage.test/storage/v1/object/upload/sign/execution-proofs/t/s/p/n.pdf?token=signed" };
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "عقد التأسيس.pdf", { type: "application/pdf" });

afterEach(() => { vi.unstubAllGlobals(); });

describe("uploadToProofSlot", () => {
  // The same request uploadToSignedUrl in @supabase/storage-js 2.108.2 sends,
  // with the URL's own token as the only credential: no key reaches the browser.
  it("puts the file to the signed URL as storage-js does, carrying no key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Key: "execution-proofs/t/s/p/n.pdf" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = pdf();
    await uploadToProofSlot(slot, file);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(slot.signedUrl);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({ "x-upsert": "false" });
    const body = init.body as FormData;
    expect(body.get("cacheControl")).toBe("3600");
    expect((body.get("") as File).name).toBe(file.name);
    expect([...body.keys()]).toEqual(["cacheControl", ""]);
  });

  it("names the limit when the store refuses the size, in Arabic", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusCode: "413", error: "Payload too large" }), { status: 400 })));
    await expect(uploadToProofSlot(slot, pdf())).rejects.toThrow("الحد الأعلى للملف 20 ميجابايت.");
  });

  it("answers any other refusal with its status, and a dropped connection with a retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream error", { status: 502 })));
    await expect(uploadToProofSlot(slot, pdf())).rejects.toThrow("502");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(uploadToProofSlot(slot, pdf())).rejects.toThrow("أعد المحاولة");
  });
});
