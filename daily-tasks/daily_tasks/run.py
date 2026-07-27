"""المشغّل اليومي: يقرأ المهام الواردة، يسجلها في الإكسل، ثم يضعها تحت التنفيذ."""

from __future__ import annotations

import sys

from playwright.sync_api import sync_playwright

from .browser import go_to_incoming_tasks, launch, login, snapshot
from .classify import GASTRO, PHYSIO, category_label, classify
from .config import load_config, load_selectors, now_stamp, today_key
from .excel import append_rows, existing_task_numbers, update_statuses
from .logger import Logger
from .parse import merge_sources, parse_pdf_fields
from .pdf import download_task_pdf, extract_pdf_fields_with_ai, extract_pdf_text
from .state import State
from .tasks import collect_task_rows, mark_task_in_progress, open_task

STATUS_PENDING = "مسجلة - بانتظار التنفيذ"
STATUS_IN_PROGRESS = "تحت التنفيذ"
STATUS_FAILED = "لم تنفذ - تحتاج مراجعة"


def main() -> int:
    config = load_config()
    selectors = load_selectors()
    logger = Logger(config.log_dir, config.secrets)
    day = today_key()

    mode = "تنفيذ فعلي" if config.mark_in_progress else "تجربة (لن يعدل النظام)"
    logger.step(f"بدء تشغيلة {day} — الوضع: {mode}")

    workbooks = {
        PHYSIO: config.output_dir / config.physio_workbook,
        GASTRO: config.output_dir / config.gastro_workbook,
        "UNKNOWN": config.output_dir / "معاملات_غير_مصنفة.xlsx",
    }

    state = State(config.state_dir)
    already_in_excel: set[str] = set()
    for path in workbooks.values():
        already_in_excel |= existing_task_numbers(path)

    summary = {"seen": 0, "skipped": 0, "recorded": 0, "marked": 0, "failed": 0}
    errors: list[str] = []

    with sync_playwright() as playwright:
        browser, context, page = launch(playwright, config, logger)
        try:
            login(page, config, selectors, logger)

            def goto_list() -> None:
                go_to_incoming_tasks(page, config, selectors, logger)

            goto_list()
            snapshot(page, config, f"tasks-list-{day}")

            tasks = collect_task_rows(page, config, selectors, logger)
            summary["seen"] = len(tasks)

            # سجل الحالة يمنع إعادة التنفيذ، والإكسل يمنع تكرار الصف. وهما شرطان منفصلان:
            # معاملة سجلت في وضع التجربة يجب أن تنفذ لاحقا دون أن يتكرر صفها.
            pending = []
            for task in tasks:
                key = task["taskNumber"] or task["url"]
                if not key:
                    continue
                if state.is_processed(key):
                    summary["skipped"] += 1
                    continue
                pending.append(task)

            if summary["skipped"]:
                logger.info(f"تم تخطي {summary['skipped']} معاملة نفذت سابقا.")

            # تعالج المهام على دفعات: كل دفعة تسجل في الإكسل ثم تنفذ ثم يحفظ سجل الحالة.
            # بهذا لا تضيع نتيجة ساعة كاملة من العمل لو انقطع الاتصال في المهمة الأخيرة.
            batches = [
                pending[index : index + config.batch_size]
                for index in range(0, len(pending), config.batch_size)
            ]
            logger.info(
                f"{len(pending)} معاملة للمعالجة على {len(batches)} دفعة "
                f"(حجم الدفعة {config.batch_size})."
            )

            for batch_index, batch in enumerate(batches, start=1):
                logger.step(f"الدفعة {batch_index} من {len(batches)}")
                collected = []

                # ===== المرحلة الأولى: قراءة كل معاملة =====
                for task in batch:
                    key = task["taskNumber"] or task["url"]
                    try:
                        open_task(page, task, config, selectors, goto_list)

                        pdf_path = download_task_pdf(page, context, config, selectors, key, logger)
                        raw_text = ""
                        pdf_fields: dict = {}
                        ai_fields: dict = {}
                        source = "عنوان المهمة"

                        if pdf_path:
                            try:
                                raw_text = extract_pdf_text(pdf_path)
                            except Exception as error:
                                logger.warn(f"المهمة {key}: تعذر قراءة نص الـPDF — {error}")

                            if len(raw_text) > 40:
                                pdf_fields = parse_pdf_fields(raw_text)
                                source = "نص PDF"
                            else:
                                # ملف ممسوح ضوئيا بلا طبقة نصية: نلجأ للتحليل الذكي إن توفر المفتاح.
                                logger.info(f"المهمة {key}: الـPDF بلا نص قابل للقراءة، محاولة التحليل الذكي.")
                                ai_fields = extract_pdf_fields_with_ai(pdf_path, config, logger) or {}
                                source = "تحليل ذكي" if ai_fields else "عنوان المهمة"

                        merged = merge_sources(row=task, pdf=pdf_fields, ai=ai_fields)
                        verdict = classify(
                            merged, f"{raw_text} {task.get('subject') or ''}", selectors["classification"]
                        )
                        task_number = merged["taskNumber"] or str(task["taskNumber"] or key)

                        collected.append(
                            {
                                "key": key,
                                "category": verdict["category"],
                                "alreadyRecorded": task_number in already_in_excel
                                or str(task["taskNumber"]) in already_in_excel,
                                "task": task,
                                "row": {
                                    "taskNumber": task_number,
                                    "patientName": merged["patientName"],
                                    "fileNumber": merged["fileNumber"],
                                    "department": merged["department"] or category_label(verdict["category"]),
                                    "requestType": merged["requestType"],
                                    "diagnosis": merged["diagnosis"],
                                    "doctor": merged["doctor"],
                                    "sender": merged["sender"],
                                    "documentDate": merged["documentDate"],
                                    "summary": merged["summary"],
                                    "status": STATUS_PENDING,
                                    "source": source,
                                    "recordedAt": now_stamp(),
                                    "taskUrl": task["url"] or page.url,
                                    "pdfPath": pdf_path.name if pdf_path else "لا يوجد مرفق",
                                },
                            }
                        )

                        note = " (مسجلة في الإكسل سابقا، ستنفذ فقط)" if task_number in already_in_excel else ""
                        logger.info(
                            f"المهمة {key}: {merged['patientName'] or 'اسم غير مستخرج'} / "
                            f"ملف {merged['fileNumber'] or 'غير مستخرج'} → "
                            f"{category_label(verdict['category'])}{note}"
                        )
                    except Exception as error:
                        summary["failed"] += 1
                        errors.append(f"{key}: {error}")
                        logger.error(f"المهمة {key}: فشلت القراءة — {error}")
                        snapshot(page, config, f"error-{str(key)}")

                # كتابة الإكسل قبل أي تعديل على النظام، حتى لا تضيع بيانات معاملة نفذت ولم تسجل.
                for category, path in workbooks.items():
                    rows = [
                        item["row"]
                        for item in collected
                        if item["category"] == category and not item["alreadyRecorded"]
                    ]
                    if not rows:
                        continue
                    added = append_rows(path, day, rows)
                    summary["recorded"] += added
                    already_in_excel.update(row["taskNumber"] for row in rows)
                    logger.info(f"تم تسجيل {added} معاملة في شريحة «{day}» بملف {path.name}.")

                # ===== المرحلة الثانية: وضع كل معاملة تحت التنفيذ =====
                status_updates: dict[str, dict[str, str]] = {}

                for item in collected:
                    try:
                        open_task(page, item["task"], config, selectors, goto_list)
                        result = mark_task_in_progress(page, config, selectors, item["key"], logger)

                        if result["marked"]:
                            summary["marked"] += 1
                            status_updates.setdefault(item["category"], {})[item["row"]["taskNumber"]] = (
                                STATUS_IN_PROGRESS
                            )
                            state.mark_processed(item["key"], day=day, category=item["category"], marked=True)
                        elif result["reason"] == "dry-run":
                            # في وضع التجربة لا نسجل المهمة كمعالجة، حتى تعالج فعليا لاحقا.
                            pass
                        else:
                            summary["failed"] += 1
                            status_updates.setdefault(item["category"], {})[item["row"]["taskNumber"]] = (
                                STATUS_FAILED
                            )
                            errors.append(f"{item['key']}: {result['reason']}")
                    except Exception as error:
                        summary["failed"] += 1
                        errors.append(f"{item['key']}: {error}")
                        logger.error(f"المهمة {item['key']}: فشل وضعها تحت التنفيذ — {error}")

                for category, updates in status_updates.items():
                    update_statuses(workbooks[category], day, updates)

                # حفظ سجل الحالة بعد كل دفعة، لا في نهاية التشغيلة فقط.
                state.save()
                logger.info(
                    f"نهاية الدفعة {batch_index}: مسجلة {summary['recorded']}، "
                    f"تحت التنفيذ {summary['marked']}، أخطاء {summary['failed']}."
                )
        finally:
            try:
                context.close()
            except Exception:
                pass
            try:
                browser.close()
            except Exception:
                pass

    logger.step(
        f"انتهت التشغيلة — مقروءة: {summary['seen']}، متخطاة: {summary['skipped']}، "
        f"مسجلة: {summary['recorded']}، تحت التنفيذ: {summary['marked']}، أخطاء: {summary['failed']}"
    )
    if errors:
        joined = "\n- ".join(errors)
        logger.warn(f"تفاصيل الأخطاء:\n- {joined}")
    logger.info(f"السجل الكامل: {logger.file}")

    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # noqa: BLE001 - نعرض سبب الفشل بالعربية بدل أثر بايثون
        print(f"فشل التشغيل: {error}", file=sys.stderr)
        sys.exit(1)
