import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { findFirst, requireFirst } from "./locate.js";

export async function launch(config, logger) {
  const browser = await chromium.launch({
    headless: config.headless,
    ...(config.chromiumPath ? { executablePath: config.chromiumPath } : {}),
  });
  const context = await browser.newContext({
    locale: "ar-SA",
    timezoneId: "Asia/Riyadh",
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
  });
  context.setDefaultTimeout(30_000);
  const page = await context.newPage();
  logger.info(`تم تشغيل المتصفح (headless=${config.headless}).`);
  return { browser, context, page };
}

export async function login(page, config, selectors, logger) {
  logger.step(`فتح ${config.baseUrl}`);
  await page.goto(config.baseUrl, { waitUntil: "domcontentloaded" });

  // إذا كانت الجلسة قائمة مسبقا فلا حاجة لإعادة الدخول.
  const already = await findFirst(page, selectors.login.successIndicator, { timeout: 3000 });
  if (already) {
    logger.info("الجلسة مفتوحة مسبقا، تم تخطي تسجيل الدخول.");
    return;
  }

  const user = await requireFirst(page, selectors.login.usernameInput, "خانة اسم المستخدم");
  await user.locator.fill(config.username);

  const pass = await requireFirst(page, selectors.login.passwordInput, "خانة كلمة المرور");
  await pass.locator.fill(config.password);

  const submit = await requireFirst(page, selectors.login.submitButton, "زر تسجيل الدخول");
  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    submit.locator.click(),
  ]);

  const ok = await findFirst(page, selectors.login.successIndicator, { timeout: 15_000 });
  if (!ok) {
    throw new Error(
      "لم يتأكد نجاح تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور في .env، " +
        "أو عدل login.successIndicator في config/selectors.json ليطابق عنصرا يظهر بعد الدخول فقط."
    );
  }
  logger.info(`تم تسجيل الدخول باسم ${config.username}.`);
}

export async function goToIncomingTasks(page, config, selectors, logger) {
  if (config.tasksUrl) {
    logger.step(`فتح صفحة المهام الواردة: ${config.tasksUrl}`);
    await page.goto(config.tasksUrl, { waitUntil: "domcontentloaded" });
    return;
  }
  logger.step("الانتقال إلى المهام الواردة من القائمة");
  const link = await requireFirst(page, selectors.navigation.incomingTasksLink, "رابط المهام الواردة");
  await link.locator.click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

export async function snapshot(page, config, name) {
  const file = path.join(config.screenshotDir, `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return file;
}
