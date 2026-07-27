"""
أداة استكشاف: تفتح النظام وتصور الصفحات وتستخرج بنيتها الحقيقية،
حتى تعبأ config/selectors.json بأسماء الأزرار الصحيحة بدل التخمين.
لا تعدل هذه الأداة أي شيء داخل النظام.
"""

from __future__ import annotations

import sys

from playwright.sync_api import sync_playwright

from .browser import go_to_incoming_tasks, launch, login, snapshot
from .config import load_config, load_selectors
from .logger import Logger

PAGE_SCRIPT = """
() => {
  const text = (element) =>
    (element.innerText || element.value || element.getAttribute('aria-label') || '')
      .replace(/\\s+/g, ' ').trim().slice(0, 80);

  const describe = (element) => {
    const parts = [element.tagName.toLowerCase()];
    if (element.id) parts.push('#' + element.id);
    if (element.name) parts.push("[name='" + element.name + "']");
    if (element.type) parts.push("[type='" + element.type + "']");
    if (element.className && typeof element.className === 'string') {
      const first = element.className.trim().split(/\\s+/)[0];
      if (first) parts.push('.' + first);
    }
    return parts.join('');
  };

  const tables = [...document.querySelectorAll('table')].map((table, tableIndex) => {
    const headerRow = table.querySelector('thead tr') || table.querySelector('tr');
    const headers = headerRow ? [...headerRow.children].map((cell, i) => i + ': ' + text(cell)) : [];
    const bodyRows = table.querySelectorAll('tbody tr').length || table.querySelectorAll('tr').length;
    return { tableIndex, headers, bodyRows };
  });

  return {
    url: location.href,
    title: document.title,
    inputs: [...document.querySelectorAll('input, textarea, select')]
      .filter((element) => element.type !== 'hidden')
      .map((element) => describe(element) + '  ← ' + (text(element) || element.placeholder || ''))
      .slice(0, 60),
    buttons: [...document.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button']")]
      .map((element) => describe(element) + '  ← "' + text(element) + '"')
      .slice(0, 80),
    links: [...document.querySelectorAll('a')]
      .map((element) => '"' + text(element) + '"  → ' + (element.getAttribute('href') || ''))
      .filter((line) => line.length > 12)
      .slice(0, 100),
    tables,
  };
}
"""


def describe_page(page, title: str) -> str:
    data = page.evaluate(PAGE_SCRIPT)

    lines = [f"## {title}", "", f"- العنوان: {data['title']}", f"- الرابط: {data['url']}", ""]

    lines.append("### الجداول (إن وجدت)")
    if data["tables"]:
        for table in data["tables"]:
            lines.append("")
            lines.append(f"جدول رقم {table['tableIndex']} — عدد الصفوف: {table['bodyRows']}")
            lines.extend(f"  {header}" for header in table["headers"])
    else:
        lines.append("  لا يوجد جدول HTML — الصفحة على الأرجح قائمة بطاقات.")

    for heading, key in (("الأزرار", "buttons"), ("الحقول", "inputs"), ("الروابط", "links")):
        lines.extend(["", f"### {heading}"])
        lines.extend(f"  {line}" for line in data[key])

    lines.extend(["", "---", ""])
    return "\n".join(lines)


def main() -> int:
    config = load_config()
    selectors = load_selectors()
    logger = Logger(config.log_dir, config.secrets)
    sections: list[str] = []

    with sync_playwright() as playwright:
        # ضع HEADLESS=false في .env لمشاهدة المتصفح أثناء الاستكشاف.
        browser, context, page = launch(playwright, config, logger)
        try:
            page.goto(config.base_url, wait_until="domcontentloaded")
            snapshot(page, config, "01-login")
            sections.append(describe_page(page, "صفحة تسجيل الدخول"))

            login(page, config, selectors, logger)
            snapshot(page, config, "02-after-login")
            sections.append(describe_page(page, "الصفحة بعد الدخول"))

            go_to_incoming_tasks(page, config, selectors, logger)
            snapshot(page, config, "03-tasks-list")
            sections.append(describe_page(page, "صفحة المهام الواردة"))

            # فتح أول مهمة لمعرفة شكل صفحة التفاصيل وزر "تحت التنفيذ".
            rows = page.locator(", ".join(selectors["taskList"]["rowContainer"]))
            if rows.count():
                first_link = rows.nth(0).locator("a").first
                if first_link.count():
                    first_link.click()
                    try:
                        page.wait_for_load_state("networkidle")
                    except Exception:
                        pass
                    snapshot(page, config, "04-task-detail")
                    sections.append(describe_page(page, "صفحة تفاصيل المهمة"))
        except Exception as error:
            logger.error(f"توقف الاستكشاف: {error}")
            sections.append(f"## توقف الاستكشاف\n\n{error}\n")
            snapshot(page, config, "99-error")
        finally:
            try:
                context.close()
            except Exception:
                pass
            try:
                browser.close()
            except Exception:
                pass

    report = "\n".join(
        [
            "# تقرير استكشاف النظام",
            "",
            "املأ القيم التالية في config/selectors.json اعتمادا على ما ظهر أدناه.",
            "لقطات الشاشة محفوظة في نفس هذا المجلد.",
            "",
            *sections,
        ]
    )

    target = config.screenshot_dir / "discovery.md"
    target.write_text(report, encoding="utf-8")
    logger.info(f"تقرير الاستكشاف: {target}")
    logger.info(f"لقطات الشاشة: {config.screenshot_dir}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001
        print(f"فشل الاستكشاف: {error}", file=sys.stderr)
        sys.exit(1)
