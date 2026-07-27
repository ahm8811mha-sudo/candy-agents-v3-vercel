"""
كل حقل في config/selectors.json عبارة عن قائمة محاولات.
هذه الدوال تجرب المحاولات بالترتيب وتعيد أول عنصر ظاهر فعلا على الصفحة،
حتى يبقى السكربت يعمل رغم اختلاف بنية الصفحات بين الشاشات.
"""

from __future__ import annotations

DEFAULT_TIMEOUT = 4000

# ذاكرة المحدد الناجح لكل حقل.
# بدونها تعيد كل مهمة تجربة المحاولات الفاشلة وتنتظر مهلتها كاملة، فتضيع عشرات
# الثواني على كل معاملة — وهو فرق ساعات على صندوق فيه أكثر من ألف مهمة.
# أول مهمة تحدد المحدد الصحيح، وبقية المهام تستخدمه مباشرة.
_resolved: dict[str, str] = {}


class NotFound(RuntimeError):
    pass


def remember_selector(cache_key: str | None, candidate: str) -> None:
    if cache_key and candidate:
        _resolved[cache_key] = candidate


def prefer_remembered(cache_key: str | None, candidates: list[str]) -> list[str]:
    """يعيد ترتيب المحاولات بحيث يأتي المحدد الذي نجح سابقا أولا."""
    cached = _resolved.get(cache_key) if cache_key else None
    if not cached or cached not in candidates:
        return candidates
    return [cached] + [candidate for candidate in candidates if candidate != cached]


def _try_candidate(scope, candidate: str, timeout: int, visible: bool):
    locator = scope.locator(candidate).first
    try:
        locator.wait_for(state="visible" if visible else "attached", timeout=timeout)
        return locator
    except Exception:
        return None


def find_first(
    scope,
    candidates,
    timeout: int = DEFAULT_TIMEOUT,
    visible: bool = True,
    cache_key: str | None = None,
):
    """يعيد (locator, selector) أو None."""
    items = [candidates] if isinstance(candidates, str) else [item for item in (candidates or []) if item]

    cached = _resolved.get(cache_key) if cache_key else None
    if cached and cached in items:
        hit = _try_candidate(scope, cached, timeout, visible)
        if hit is not None:
            return hit, cached
        # الصفحة تغيرت: نسقط الذاكرة ونعيد البحث الكامل.
        _resolved.pop(cache_key, None)

    for candidate in items:
        if candidate == cached:
            continue
        hit = _try_candidate(scope, candidate, timeout, visible)
        if hit is not None:
            remember_selector(cache_key, candidate)
            return hit, candidate

    return None


def require_first(scope, candidates, label: str, **kwargs):
    found = find_first(scope, candidates, **kwargs)
    if found is None:
        raise NotFound(
            f"تعذر العثور على «{label}» في الصفحة. عدل قائمة المحددات الخاصة به في "
            f"config/selectors.json (جرب: {candidates}). "
            f'شغل "python -m daily_tasks.discover" لمعرفة البنية الحقيقية للصفحة.'
        )
    return found
