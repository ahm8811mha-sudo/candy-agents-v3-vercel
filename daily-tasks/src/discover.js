import fs from "node:fs";
import path from "node:path";
import { loadConfig, loadSelectors } from "./config.js";
import { createLogger } from "./logger.js";
import { launch, login, goToIncomingTasks, snapshot } from "./browser.js";

/**
 * أداة استكشاف: تفتح النظام وتصور الصفحات وتستخرج بنيتها الحقيقية،
 * حتى تعبأ config/selectors.json بأرقام الأعمدة وأسماء الأزرار الصحيحة
 * بدل التخمين. لا تعدل هذه الأداة أي شيء داخل النظام.
 */

async function describePage(page, title) {
  const data = await page.evaluate(() => {
    const text = (element) =>
      (element.innerText || element.value || element.getAttribute("aria-label") || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    const describe = (element) => {
      const parts = [element.tagName.toLowerCase()];
      if (element.id) parts.push(`#${element.id}`);
      if (element.name) parts.push(`[name='${element.name}']`);
      if (element.type) parts.push(`[type='${element.type}']`);
      return parts.join("");
    };

    const tables = [...document.querySelectorAll("table")].map((table, tableIndex) => {
      const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
      const headers = headerRow ? [...headerRow.children].map((cell, index) => `${index}: ${text(cell)}`) : [];
      const bodyRows = table.querySelectorAll("tbody tr").length || table.querySelectorAll("tr").length;
      return { tableIndex, headers, bodyRows };
    });

    return {
      url: location.href,
      title: document.title,
      inputs: [...document.querySelectorAll("input, textarea, select")]
        .filter((element) => element.type !== "hidden")
        .map((element) => `${describe(element)}  ← ${text(element) || element.placeholder || ""}`)
        .slice(0, 60),
      buttons: [...document.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button']")]
        .map((element) => `${describe(element)}  ← "${text(element)}"`)
        .slice(0, 80),
      links: [...document.querySelectorAll("a")]
        .map((element) => `"${text(element)}"  → ${element.getAttribute("href") || ""}`)
        .filter((line) => line.length > 12)
        .slice(0, 100),
      tables,
    };
  });

  const lines = [
    `## ${title}`,
    "",
    `- العنوان: ${data.title}`,
    `- الرابط: ${data.url}`,
    "",
    "### الجداول (استخدم أرقام الأعمدة في taskList.columns)",
    ...(data.tables.length
      ? data.tables.flatMap((table) => [
          "",
          `جدول رقم ${table.tableIndex} — عدد الصفوف: ${table.bodyRows}`,
          ...table.headers.map((header) => `  ${header}`),
        ])
      : ["  لا يوجد جدول HTML في هذه الصفحة."]),
    "",
    "### الأزرار",
    ...data.buttons.map((line) => `  ${line}`),
    "",
    "### الحقول",
    ...data.inputs.map((line) => `  ${line}`),
    "",
    "### الروابط",
    ...data.links.map((line) => `  ${line}`),
    "",
    "---",
    "",
  ];

  return lines.join("\n");
}

async function main() {
  const config = loadConfig();
  const selectors = loadSelectors();
  const logger = createLogger({ logDir: config.logDir, secrets: [config.password, config.openaiKey] });

  // ضع HEADLESS=false في .env لمشاهدة المتصفح أثناء الاستكشاف.
  const { browser, context, page } = await launch(config, logger);
  const sections = [];

  try {
    await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });
    await snapshot(page, config, "01-login");
    sections.push(await describePage(page, "صفحة تسجيل الدخول"));

    await login(page, config, selectors, logger);
    await snapshot(page, config, "02-after-login");
    sections.push(await describePage(page, "الصفحة بعد الدخول"));

    await goToIncomingTasks(page, config, selectors, logger);
    await snapshot(page, config, "03-tasks-list");
    sections.push(await describePage(page, "صفحة المهام الواردة"));

    // فتح أول مهمة لمعرفة شكل صفحة التفاصيل وزر "تحت التنفيذ".
    const rows = page.locator(selectors.taskList.rowContainer.join(", "));
    if (await rows.count()) {
      const firstLink = rows.nth(0).locator("a").first();
      if (await firstLink.count()) {
        await firstLink.click();
        await page.waitForLoadState("networkidle").catch(() => {});
        await snapshot(page, config, "04-task-detail");
        sections.push(await describePage(page, "صفحة تفاصيل المهمة"));
      }
    }
  } catch (error) {
    logger.error(`توقف الاستكشاف: ${error.message}`);
    sections.push(`## توقف الاستكشاف\n\n${error.message}\n`);
    await snapshot(page, config, "99-error");
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const report = [
    "# تقرير استكشاف النظام",
    "",
    "املأ القيم التالية في config/selectors.json اعتمادا على ما ظهر أدناه.",
    "لقطات الشاشة محفوظة في نفس هذا المجلد.",
    "",
    ...sections,
  ].join("\n");

  const file = path.join(config.screenshotDir, "discovery.md");
  fs.writeFileSync(file, report, "utf8");
  logger.info(`تقرير الاستكشاف: ${file}`);
  logger.info(`لقطات الشاشة: ${config.screenshotDir}`);
}

main().catch((error) => {
  console.error(`فشل الاستكشاف: ${error.message}`);
  process.exitCode = 1;
});
