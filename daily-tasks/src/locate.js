/**
 * كل حقل في config/selectors.json عبارة عن قائمة محاولات.
 * هذه الدوال تجرب المحاولات بالترتيب وتعيد أول عنصر ظاهر فعلا على الصفحة،
 * حتى يبقى السكربت يعمل رغم اختلاف بنية الصفحات بين الشاشات.
 */

const DEFAULT_TIMEOUT = 4000;

export async function findFirst(scope, candidates, { timeout = DEFAULT_TIMEOUT, visible = true } = {}) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (const candidate of list) {
    if (!candidate) continue;
    const locator = scope.locator(candidate).first();
    try {
      await locator.waitFor({ state: visible ? "visible" : "attached", timeout });
      return { locator, selector: candidate };
    } catch {
      // جرب المحاولة التالية
    }
  }
  return null;
}

export async function requireFirst(scope, candidates, label, options) {
  const found = await findFirst(scope, candidates, options);
  if (!found) {
    throw new Error(
      `تعذر العثور على «${label}» في الصفحة. عدل قائمة المحددات الخاصة به في config/selectors.json ` +
        `(جرب: ${JSON.stringify(candidates)}). شغل "npm run discover" لمعرفة البنية الحقيقية للصفحة.`
    );
  }
  return found;
}

export async function clickFirst(scope, candidates, label, options) {
  const { locator } = await requireFirst(scope, candidates, label, options);
  await locator.click();
  return locator;
}

export async function textOf(locator) {
  if (!locator) return "";
  const value = await locator.innerText().catch(() => "");
  return value.replace(/\s+/g, " ").trim();
}
