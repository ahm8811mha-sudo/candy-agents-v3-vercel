/**
 * كل حقل في config/selectors.json عبارة عن قائمة محاولات.
 * هذه الدوال تجرب المحاولات بالترتيب وتعيد أول عنصر ظاهر فعلا على الصفحة،
 * حتى يبقى السكربت يعمل رغم اختلاف بنية الصفحات بين الشاشات.
 */

const DEFAULT_TIMEOUT = 4000;

/**
 * ذاكرة المحدد الناجح لكل حقل.
 * بدونها تعيد كل مهمة تجربة المحاولات الفاشلة وتنتظر مهلتها كاملة، فتضيع عشرات
 * الثواني على كل معاملة — وهو فرق ساعات على صندوق فيه أكثر من ألف مهمة.
 * أول مهمة تحدد المحدد الصحيح، وبقية المهام تستخدمه مباشرة.
 */
const resolved = new Map();

export function rememberSelector(cacheKey, candidate) {
  if (cacheKey && candidate) resolved.set(cacheKey, candidate);
}

/** يعيد ترتيب المحاولات بحيث يأتي المحدد الذي نجح سابقا أولا. */
export function preferRemembered(cacheKey, candidates) {
  const cached = cacheKey ? resolved.get(cacheKey) : null;
  if (!cached || !candidates.includes(cached)) return candidates;
  return [cached, ...candidates.filter((candidate) => candidate !== cached)];
}

async function tryCandidate(scope, candidate, timeout, visible) {
  const locator = scope.locator(candidate).first();
  try {
    await locator.waitFor({ state: visible ? "visible" : "attached", timeout });
    return { locator, selector: candidate };
  } catch {
    return null;
  }
}

export async function findFirst(
  scope,
  candidates,
  { timeout = DEFAULT_TIMEOUT, visible = true, cacheKey = null } = {}
) {
  const list = (Array.isArray(candidates) ? candidates : [candidates]).filter(Boolean);

  const cached = cacheKey ? resolved.get(cacheKey) : null;
  if (cached && list.includes(cached)) {
    const hit = await tryCandidate(scope, cached, timeout, visible);
    if (hit) return hit;
    // الصفحة تغيرت: نسقط الذاكرة ونعيد البحث الكامل.
    resolved.delete(cacheKey);
  }

  for (const candidate of list) {
    if (candidate === cached) continue;
    const hit = await tryCandidate(scope, candidate, timeout, visible);
    if (hit) {
      if (cacheKey) resolved.set(cacheKey, candidate);
      return hit;
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
