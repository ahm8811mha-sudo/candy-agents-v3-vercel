"""قراءة قائمة المهام الواردة، فتح كل مهمة، ووضعها تحت التنفيذ."""

from __future__ import annotations

from urllib.parse import urljoin

from .locate import find_first, prefer_remembered, remember_selector, require_first
from .parse import (
    clean,
    normalize_digits,
    parse_arabic_date,
    parse_sender,
    parse_task_number,
    parse_task_title,
)


def collect_task_rows(page, config, selectors, logger) -> list[dict]:
    """يقرأ بطاقات المهام الواردة عبر كل الصفحات ويعيد وصفا مبدئيا لكل مهمة."""
    columns = selectors["taskList"]["columns"]
    collected: list[dict] = []
    seen_keys: set[str] = set()
    page_index = 1

    while len(collected) < config.max_tasks:
        rows = page.locator(", ".join(selectors["taskList"]["rowContainer"]))
        count = rows.count()
        logger.info(f"صفحة المهام {page_index}: {count} صف.")

        if count == 0 and page_index == 1:
            logger.warn(
                "لم يقرأ السكربت أي بطاقة. عدل taskList.rowContainer في config/selectors.json "
                "ليطابق بطاقات المهام عندك."
            )

        for index in range(count):
            if len(collected) >= config.max_tasks:
                break

            row = rows.nth(index)
            cells = row.locator("td, th, div[role='cell']")
            cell_count = cells.count()

            def value_at(column_index) -> str:
                if column_index is None or column_index >= cell_count:
                    return ""
                try:
                    return clean(cells.nth(column_index).inner_text())
                except Exception:
                    return ""

            link = find_first(
                row, selectors["taskList"]["openTaskLink"], timeout=1200, cache_key="openTaskLink"
            )
            href = link[0].get_attribute("href") if link else None

            # نص البطاقة كاملا: منه نقرأ رقم المهمة والتاريخ والجهة المرسلة.
            try:
                card_text = clean(row.inner_text())
            except Exception:
                card_text = ""

            title_found = find_first(
                row, selectors["taskList"].get("titleText") or [], timeout=1200, cache_key="titleText"
            )
            title = clean(title_found[0].inner_text()) if title_found else ""

            # عنوان المهمة يحمل: نوع الطلب - اسم المريض - رقم الملف - الطبيب - القسم
            from_title = parse_task_title(title)

            usable_href = bool(href) and not href.startswith("javascript:") and not href.startswith("#")

            record = {
                "taskNumber": normalize_digits(value_at(columns["taskNumber"])) or parse_task_number(card_text),
                "patientName": value_at(columns["patientName"]) or from_title.get("patientName", ""),
                "fileNumber": normalize_digits(value_at(columns["fileNumber"])) or from_title.get("fileNumber", ""),
                "department": from_title.get("department", ""),
                "doctor": from_title.get("doctor", ""),
                "requestType": from_title.get("requestType", ""),
                "title": title,
                "subject": value_at(columns["subject"]) or title,
                "sender": value_at(columns["sender"]) or parse_sender(card_text),
                "date": value_at(columns["date"]) or parse_arabic_date(card_text),
                "url": urljoin(page.url, href) if usable_href else None,
                "listPageIndex": page_index,
                "rowIndex": index,
            }

            # نتجاهل الصفوف الفارغة أو صف "لا توجد بيانات".
            if not record["taskNumber"] and not record["url"] and not record["subject"]:
                continue

            key = record["taskNumber"] or record["url"] or f"{page_index}:{index}"
            if key in seen_keys:
                continue
            seen_keys.add(key)
            collected.append(record)

        nxt = find_first(page, selectors["taskList"]["nextPageButton"], timeout=2000)
        if not nxt:
            break

        locator = nxt[0]
        try:
            if locator.is_disabled() or locator.get_attribute("aria-disabled") == "true":
                break
        except Exception:
            pass

        locator.click()
        try:
            page.wait_for_load_state("networkidle")
        except Exception:
            pass
        page_index += 1

    logger.info(f"إجمالي المهام المقروءة: {len(collected)}.")
    return collected


def open_task(page, task, config, selectors, goto_list) -> None:
    """يفتح صفحة تفاصيل المهمة، سواء عبر رابط مباشر أو بالضغط على البطاقة."""
    if task["url"]:
        page.goto(task["url"], wait_until="domcontentloaded")
        return

    goto_list()
    for _ in range(1, task["listPageIndex"]):
        nxt, _selector = require_first(page, selectors["taskList"]["nextPageButton"], "زر الصفحة التالية")
        nxt.click()
        try:
            page.wait_for_load_state("networkidle")
        except Exception:
            pass

    rows = page.locator(", ".join(selectors["taskList"]["rowContainer"]))
    row = rows.nth(task["rowIndex"])
    link = find_first(row, selectors["taskList"]["openTaskLink"], timeout=4000)
    (link[0] if link else row).click()
    try:
        page.wait_for_load_state("networkidle")
    except Exception:
        pass


def mark_task_in_progress(page, config, selectors, task_number, logger) -> dict:
    """
    يضع المعاملة تحت التنفيذ: يضغط الزر، ينتظر خانة الكتابة، يكتب النص، ثم يحفظ.
    لا ينفذ شيئا إلا إذا كان وضع التنفيذ الفعلي مفعلا.
    """
    if not config.mark_in_progress:
        logger.info(f'المهمة {task_number}: وضع التجربة — لم يضغط زر "تحت التنفيذ".')
        return {"marked": False, "reason": "dry-run"}

    # نجرب مرشحي الزر واحدا واحدا ونتحقق بعد كل ضغطة من ظهور خانة الكتابة.
    # السبب: عبارة "تحت التنفيذ" ترد أيضا كشارة حالة على البطاقة، فالضغط عليها لا يفعل
    # شيئا، والاكتفاء بأول مطابقة يجعل السكربت يظن أنه ضغط الزر وهو لم يضغطه.
    box = None
    clicked_any = False

    for candidate in prefer_remembered("inProgressButton", selectors["taskDetail"]["inProgressButton"]):
        button = find_first(page, [candidate], timeout=3000)
        if not button:
            continue

        try:
            button[0].click()
        except Exception:
            pass
        clicked_any = True

        box = find_first(page, selectors["taskDetail"]["commentBox"], timeout=5000, cache_key="commentBox")
        if box:
            remember_selector("inProgressButton", candidate)
            break

    if not clicked_any:
        logger.warn(f'المهمة {task_number}: لم يوجد زر "تحت التنفيذ" في الصفحة.')
        return {"marked": False, "reason": "button-not-found"}

    if not box:
        logger.warn(
            f"المهمة {task_number}: لم تظهر خانة الكتابة بعد الضغط. "
            "عدل taskDetail.inProgressButton أو taskDetail.commentBox في config/selectors.json."
        )
        return {"marked": False, "reason": "comment-box-not-found"}

    box_locator = box[0]
    if box_locator.get_attribute("contenteditable") == "true":
        box_locator.click()
        try:
            box_locator.fill("")
        except Exception:
            pass
        page.keyboard.type(config.in_progress_comment, delay=15)
    else:
        box_locator.fill(config.in_progress_comment)

    save = find_first(page, selectors["taskDetail"]["saveButton"], timeout=8000, cache_key="saveButton")
    if not save:
        logger.warn(f"المهمة {task_number}: لم يوجد زر الحفظ — لم يحفظ أي تغيير.")
        return {"marked": False, "reason": "save-button-not-found"}

    save[0].click()
    try:
        page.wait_for_load_state("networkidle")
    except Exception:
        pass

    confirmed = find_first(
        page, selectors["taskDetail"]["saveConfirmation"], timeout=6000, cache_key="saveConfirmation"
    )
    logger.info(
        f"المهمة {task_number}: تم وضعها تحت التنفيذ وحفظ الملاحظة."
        if confirmed
        else f"المهمة {task_number}: نفذ الحفظ لكن لم تظهر رسالة تأكيد — راجعها يدويا."
    )

    return {"marked": True, "confirmed": bool(confirmed)}
