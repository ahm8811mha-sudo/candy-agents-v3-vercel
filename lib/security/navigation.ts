/** Resolve only same-origin application destinations, including backslash normalization. */
export function safeInternalDestination(candidate: string | null | undefined): string {
  if (!candidate?.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return "/";
  try {
    const url = new URL(candidate, "https://orvanta.invalid");
    if (url.origin !== "https://orvanta.invalid" || url.pathname.startsWith("/login")) return "/";
    return url.pathname + url.search + url.hash;
  } catch { return "/"; }
}
