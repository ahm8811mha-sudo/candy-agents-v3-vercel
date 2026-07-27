import path from "node:path";
import { loadConfig, loadSelectors, todayKey, nowStamp } from "./config.js";
import { createLogger } from "./logger.js";
import { launch, login, goToIncomingTasks, snapshot } from "./browser.js";
import { collectTaskRows, openTask, markTaskInProgress } from "./tasks.js";
import { downloadTaskPdf, extractPdfText, extractPdfFieldsWithAi } from "./pdf.js";
import { parsePdfFields, mergeSources } from "./parse.js";
import { classify, categoryLabel, PHYSIO, GASTRO } from "./classify.js";
import { appendRows, existingTaskNumbers, updateStatuses } from "./excel.js";
import { loadState, isProcessed, markProcessed, saveState } from "./state.js";

const STATUS_PENDING = "مسجلة - بانتظار التنفيذ";
const STATUS_IN_PROGRESS = "تحت التنفيذ";
const STATUS_FAILED = "لم تنفذ - تحتاج مراجعة";

async function main() {
  const config = loadConfig();
  const selectors = loadSelectors();
  const logger = createLogger({ logDir: config.logDir, secrets: [config.password, config.openaiKey] });
  const day = todayKey();

  logger.step(`بدء تشغيلة ${day} — الوضع: ${config.markInProgress ? "تنفيذ فعلي" : "تجربة (لن يعدل النظام)"}`);

  const workbooks = {
    [PHYSIO]: path.join(config.outputDir, config.physioWorkbook),
    [GASTRO]: path.join(config.outputDir, config.gastroWorkbook),
    UNKNOWN: path.join(config.outputDir, "معاملات_غير_مصنفة.xlsx"),
  };

  const state = loadState(config.stateDir);
  const alreadyInExcel = new Set();
  for (const file of Object.values(workbooks)) {
    for (const taskNumber of await existingTaskNumbers(file)) alreadyInExcel.add(taskNumber);
  }

  const { browser, context, page } = await launch(config, logger);
  const summary = { seen: 0, skipped: 0, recorded: 0, marked: 0, failed: 0, errors: [] };

  try {
    await login(page, config, selectors, logger);
    const gotoList = () => goToIncomingTasks(page, config, selectors, logger);
    await gotoList();
    await snapshot(page, config, `tasks-list-${day}`);

    const tasks = await collectTaskRows(page, config, selectors, logger);
    summary.seen = tasks.length;

    // ============ المرحلة الأولى: قراءة كل معاملة وتسجيلها في الإكسل ============
    const collected = [];

    for (const task of tasks) {
      const key = task.taskNumber || task.url;
      if (!key) continue;

      if (isProcessed(state, key) || alreadyInExcel.has(String(task.taskNumber))) {
        summary.skipped += 1;
        logger.info(`المهمة ${key}: مسجلة سابقا، تم تخطيها.`);
        continue;
      }

      try {
        await openTask(page, task, config, selectors, gotoList);

        const pdfPath = await downloadTaskPdf(page, context, config, selectors, key, logger);
        let rawText = "";
        let pdfFields = {};
        let aiFields = {};
        let source = "الجدول فقط";

        if (pdfPath) {
          rawText = await extractPdfText(pdfPath).catch((error) => {
            logger.warn(`المهمة ${key}: تعذر قراءة نص الـPDF — ${error.message}`);
            return "";
          });

          if (rawText.length > 40) {
            pdfFields = parsePdfFields(rawText);
            source = "نص PDF";
          } else {
            // ملف ممسوح ضوئيا بلا طبقة نصية: نلجأ للتحليل الذكي إن توفر المفتاح.
            logger.info(`المهمة ${key}: الـPDF بلا نص قابل للقراءة، محاولة التحليل الذكي.`);
            aiFields = (await extractPdfFieldsWithAi(pdfPath, config, logger)) || {};
            source = Object.keys(aiFields).length ? "تحليل ذكي" : "يحتاج إدخال يدوي";
          }
        }

        const merged = mergeSources({ row: task, pdf: pdfFields, ai: aiFields });
        const verdict = classify(merged, `${rawText} ${task.subject || ""}`, selectors.classification);

        collected.push({
          key,
          category: verdict.category,
          row: {
            taskNumber: merged.taskNumber || String(task.taskNumber || key),
            patientName: merged.patientName,
            fileNumber: merged.fileNumber,
            department: merged.department || categoryLabel(verdict.category),
            requestType: merged.requestType,
            diagnosis: merged.diagnosis,
            doctor: merged.doctor,
            sender: merged.sender,
            documentDate: merged.documentDate,
            summary: merged.summary,
            status: STATUS_PENDING,
            source,
            recordedAt: nowStamp(),
            taskUrl: task.url || page.url(),
            pdfPath: pdfPath ? path.basename(pdfPath) : "لا يوجد مرفق",
          },
          task,
        });

        logger.info(
          `المهمة ${key}: ${merged.patientName || "اسم غير مستخرج"} / ملف ${merged.fileNumber || "غير مستخرج"} → ${categoryLabel(verdict.category)}`
        );
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(`${key}: ${error.message}`);
        logger.error(`المهمة ${key}: فشلت القراءة — ${error.message}`);
        await snapshot(page, config, `error-${String(key).replace(/\W+/g, "_")}`);
      }
    }

    // كتابة الإكسل قبل أي تعديل على النظام، حتى لا تضيع بيانات معاملة نفذت ولم تسجل.
    for (const [category, file] of Object.entries(workbooks)) {
      const rows = collected.filter((item) => item.category === category).map((item) => item.row);
      if (!rows.length) continue;
      const result = await appendRows(file, day, rows);
      summary.recorded += result.added;
      logger.info(`تم تسجيل ${result.added} معاملة في شريحة «${day}» بملف ${path.basename(file)}.`);
    }

    // ============ المرحلة الثانية: وضع كل معاملة تحت التنفيذ ============
    const statusUpdates = {};

    for (const item of collected) {
      try {
        await openTask(page, item.task, config, selectors, gotoList);
        const result = await markTaskInProgress(page, config, selectors, item.key, logger);

        if (result.marked) {
          summary.marked += 1;
          statusUpdates[item.category] ??= {};
          statusUpdates[item.category][item.row.taskNumber] = STATUS_IN_PROGRESS;
          markProcessed(state, item.key, { day, category: item.category, marked: true });
        } else if (result.reason === "dry-run") {
          // في وضع التجربة لا نسجل المهمة كمعالجة، حتى تعالج فعليا في تشغيلة حقيقية.
        } else {
          summary.failed += 1;
          statusUpdates[item.category] ??= {};
          statusUpdates[item.category][item.row.taskNumber] = STATUS_FAILED;
          summary.errors.push(`${item.key}: ${result.reason}`);
        }
      } catch (error) {
        summary.failed += 1;
        summary.errors.push(`${item.key}: ${error.message}`);
        logger.error(`المهمة ${item.key}: فشل وضعها تحت التنفيذ — ${error.message}`);
      }
    }

    for (const [category, updates] of Object.entries(statusUpdates)) {
      await updateStatuses(workbooks[category], day, updates);
    }

    saveState(state);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  logger.step(
    `انتهت التشغيلة — مقروءة: ${summary.seen}، متخطاة: ${summary.skipped}، مسجلة: ${summary.recorded}، ` +
      `تحت التنفيذ: ${summary.marked}، أخطاء: ${summary.failed}`
  );
  if (summary.errors.length) {
    logger.warn(`تفاصيل الأخطاء:\n- ${summary.errors.join("\n- ")}`);
  }
  logger.info(`السجل الكامل: ${logger.file}`);

  process.exitCode = summary.failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(`فشل التشغيل: ${error.message}`);
  process.exitCode = 1;
});
