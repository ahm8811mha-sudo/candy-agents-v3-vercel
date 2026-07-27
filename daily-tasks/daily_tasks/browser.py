"""تشغيل المتصفح، تسجيل الدخول، والانتقال إلى المهام الواردة."""

from __future__ import annotations

from pathlib import Path

from .locate import NotFound, find_first, require_first


def launch(playwright, config, logger):
    launch_args = {"headless": config.headless}
    if config.chromium_path:
        launch_args["executable_path"] = config.chromium_path

    browser = playwright.chromium.launch(**launch_args)
    context = browser.new_context(
        locale="ar-SA",
        timezone_id="Asia/Riyadh",
        viewport={"width": 1440, "height": 900},
        accept_downloads=True,
        ignore_https_errors=True,
    )
    context.set_default_timeout(30_000)
    page = context.new_page()
    logger.info(f"تم تشغيل المتصفح (headless={config.headless}).")
    return browser, context, page


def login(page, config, selectors, logger) -> None:
    logger.step(f"فتح {config.base_url}")
    page.goto(config.base_url, wait_until="domcontentloaded")

    # إذا كانت الجلسة قائمة مسبقا فلا حاجة لإعادة الدخول.
    if find_first(page, selectors["login"]["successIndicator"], timeout=3000):
        logger.info("الجلسة مفتوحة مسبقا، تم تخطي تسجيل الدخول.")
        return

    user, _ = require_first(page, selectors["login"]["usernameInput"], "خانة اسم المستخدم")
    user.fill(config.username)

    password, _ = require_first(page, selectors["login"]["passwordInput"], "خانة كلمة المرور")
    password.fill(config.password)

    submit, _ = require_first(page, selectors["login"]["submitButton"], "زر تسجيل الدخول")
    submit.click()
    try:
        page.wait_for_load_state("networkidle")
    except Exception:
        pass

    if not find_first(page, selectors["login"]["successIndicator"], timeout=15_000):
        raise NotFound(
            "لم يتأكد نجاح تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور في .env، "
            "أو عدل login.successIndicator في config/selectors.json ليطابق عنصرا يظهر بعد الدخول فقط."
        )

    logger.info(f"تم تسجيل الدخول باسم {config.username}.")


def go_to_incoming_tasks(page, config, selectors, logger) -> None:
    if config.tasks_url:
        logger.step(f"فتح صفحة المهام الواردة: {config.tasks_url}")
        page.goto(config.tasks_url, wait_until="domcontentloaded")
        return

    logger.step("الانتقال إلى المهام الواردة من القائمة")
    link, _ = require_first(page, selectors["navigation"]["incomingTasksLink"], "رابط المهام الواردة")
    link.click()
    try:
        page.wait_for_load_state("networkidle")
    except Exception:
        pass


def snapshot(page, config, name: str) -> Path:
    target = config.screenshot_dir / f"{name}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        page.screenshot(path=str(target), full_page=True)
    except Exception:
        pass
    return target
