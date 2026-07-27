import { findFirst, requireFirst } from "./locate.js";
import { clean, normalizeDigits } from "./parse.js";

/** يقرأ صفوف جدول المهام الواردة عبر كل الصفحات ويعيد وصفا مبدئيا لكل مهمة. */
export async function collectTaskRows(page, config, selectors, logger) {
  const { columns } = selectors.taskList;
  const collected = [];
  const seenKeys = new Set();
  let pageIndex = 1;

  while (collected.length < config.maxTasks) {
    const rows = page.locator(selectors.taskList.rowContainer.join(", "));
    const count = await rows.count();
    logger.info(`صفحة المهام ${pageIndex}: ${count} صف.`);

    if (count === 0 && pageIndex === 1) {
      logger.warn(
        "لم يقرأ السكربت أي صف. عدل taskList.rowContainer في config/selectors.json ليطابق صفوف الجدول عندك."
      );
    }

    for (let index = 0; index < count && collected.length < config.maxTasks; index += 1) {
      const row = rows.nth(index);
      const cells = row.locator("td, th, div[role='cell']");
      const cellCount = await cells.count();

      const valueAt = async (columnIndex) => {
        if (columnIndex === null || columnIndex === undefined) return "";
        if (columnIndex >= cellCount) return "";
        const text = await cells.nth(columnIndex).innerText().catch(() => "");
        return clean(text);
      };

      const link = await findFirst(row, selectors.taskList.openTaskLink, { timeout: 1200 });
      const href = link ? await link.locator.getAttribute("href").catch(() => null) : null;

      const record = {
        taskNumber: normalizeDigits(await valueAt(columns.taskNumber)),
        patientName: await valueAt(columns.patientName),
        fileNumber: normalizeDigits(await valueAt(columns.fileNumber)),
        subject: await valueAt(columns.subject),
        sender: await valueAt(columns.sender),
        date: await valueAt(columns.date),
        url: href && !href.startsWith("javascript:") && !href.startsWith("#")
          ? new URL(href, page.url()).toString()
          : null,
        listPageIndex: pageIndex,
        rowIndex: index,
      };

      // بعض الجداول تحتوي صف رأس مكرر أو صف "لا توجد بيانات" — نتجاهل الصفوف الفارغة.
      if (!record.taskNumber && !record.url && !record.subject) continue;

      const key = record.taskNumber || record.url || `${pageIndex}:${index}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      collected.push(record);
    }

    const next = await findFirst(page, selectors.taskList.nextPageButton, { timeout: 2000 });
    if (!next) break;

    const disabled = await next.locator.isDisabled().catch(() => false);
    const ariaDisabled = await next.locator.getAttribute("aria-disabled").catch(() => null);
    if (disabled || ariaDisabled === "true") break;

    await next.locator.click();
    await page.waitForLoadState("networkidle").catch(() => {});
    pageIndex += 1;
  }

  logger.info(`إجمالي المهام المقروءة: ${collected.length}.`);
  return collected;
}

/** يفتح صفحة تفاصيل المهمة، سواء عبر رابط مباشر أو بالضغط على صف الجدول. */
export async function openTask(page, task, config, selectors, gotoList) {
  if (task.url) {
    await page.goto(task.url, { waitUntil: "domcontentloaded" });
    return;
  }

  await gotoList();
  for (let step = 1; step < task.listPageIndex; step += 1) {
    const next = await requireFirst(page, selectors.taskList.nextPageButton, "زر الصفحة التالية");
    await next.locator.click();
    await page.waitForLoadState("networkidle").catch(() => {});
  }

  const rows = page.locator(selectors.taskList.rowContainer.join(", "));
  const row = rows.nth(task.rowIndex);
  const link = await findFirst(row, selectors.taskList.openTaskLink, { timeout: 4000 });
  await (link ? link.locator : row).click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * يضع المعاملة تحت التنفيذ: يضغط الزر، ينتظر خانة الكتابة، يكتب النص، ثم يحفظ.
 * لا ينفذ شيئا إلا إذا كان وضع التنفيذ الفعلي مفعلا.
 */
export async function markTaskInProgress(page, config, selectors, taskNumber, logger) {
  if (!config.markInProgress) {
    logger.info(`المهمة ${taskNumber}: وضع التجربة — لم يضغط زر "تحت التنفيذ".`);
    return { marked: false, reason: "dry-run" };
  }

  const button = await findFirst(page, selectors.taskDetail.inProgressButton, { timeout: 8000 });
  if (!button) {
    logger.warn(`المهمة ${taskNumber}: لم يوجد زر "تحت التنفيذ" في الصفحة.`);
    return { marked: false, reason: "button-not-found" };
  }
  await button.locator.click();

  const box = await findFirst(page, selectors.taskDetail.commentBox, { timeout: 10_000 });
  if (!box) {
    logger.warn(`المهمة ${taskNumber}: لم تظهر خانة الكتابة بعد الضغط على الزر.`);
    return { marked: false, reason: "comment-box-not-found" };
  }

  const editable = await box.locator.getAttribute("contenteditable").catch(() => null);
  if (editable === "true") {
    await box.locator.click();
    await box.locator.fill("").catch(() => {});
    await page.keyboard.type(config.inProgressComment, { delay: 15 });
  } else {
    await box.locator.fill(config.inProgressComment);
  }

  const save = await findFirst(page, selectors.taskDetail.saveButton, { timeout: 8000 });
  if (!save) {
    logger.warn(`المهمة ${taskNumber}: لم يوجد زر الحفظ — لم يحفظ أي تغيير.`);
    return { marked: false, reason: "save-button-not-found" };
  }
  await save.locator.click();
  await page.waitForLoadState("networkidle").catch(() => {});

  const confirmed = await findFirst(page, selectors.taskDetail.saveConfirmation, { timeout: 6000 });
  logger.info(
    confirmed
      ? `المهمة ${taskNumber}: تم وضعها تحت التنفيذ وحفظ الملاحظة.`
      : `المهمة ${taskNumber}: نفذ الحفظ لكن لم تظهر رسالة تأكيد — راجعها يدويا.`
  );

  return { marked: true, confirmed: Boolean(confirmed) };
}
