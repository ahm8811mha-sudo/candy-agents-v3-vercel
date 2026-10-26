/** Request header set by the proxy when the response is a public document. */
export const PUBLIC_PAGE_HEADER = "x-orvanta-public-page";

/**
 * True only for the pages Google's OAuth review must read without a login
 * redirect: the site root for an anonymous visitor, and the privacy and terms
 * documents. Every other path keeps the owner gate.
 */
export function shouldServePublicDocument(pathname: string, unlocked: boolean): boolean {
  if (pathname === "/privacy" || pathname === "/terms") return true;
  return pathname === "/" && !unlocked;
}
