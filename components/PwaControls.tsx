"use client";
import { useSyncExternalStore, useState } from "react";

function subscribe(callback: () => void) {
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function getMode() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (standalone) return "standalone";
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "ios" : "browser";
}
export default function PwaControls() {
  const mode = useSyncExternalStore(subscribe, getMode, () => "unknown");
  const [message, setMessage] = useState("");
  async function enableNotifications() {
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      setMessage("الإشعارات غير مدعومة في هذا المتصفح. على آيفون افتح التطبيق من الشاشة الرئيسية.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setMessage(permission === "granted" ? "تم السماح بتنبيهات القرارات أثناء تشغيل التطبيق." : "لم يتم السماح بالإشعارات. يمكنك مراجعة إعدادات الجهاز.");
    } catch { setMessage("تعذر تفعيل الإشعارات على هذا الجهاز."); }
  }
  if (mode === "unknown") return null;
  return <div className="sidebar-tools" style={{ paddingBlock: 10 }}>
    {mode === "ios" ? <p style={{ fontSize: 12, lineHeight: 1.7 }}>لتثبيت أورفانتا: افتح الموقع في Safari، ثم مشاركة ← إضافة إلى الشاشة الرئيسية.</p> : null}
    {mode === "browser" ? <p style={{ fontSize: 12, lineHeight: 1.7 }}>يمكن تثبيت أورفانتا من قائمة المتصفح إذا كان يدعم تطبيقات الويب.</p> : null}
    {mode === "standalone" ? <p style={{ fontSize: 12 }}>أورفانتا — وضع التطبيق</p> : null}
    {mode !== "ios" ? <button type="button" onClick={enableNotifications}>تفعيل تنبيهات القرارات</button> : null}
    {message ? <p role="status" style={{ fontSize: 12, lineHeight: 1.7 }}>{message}</p> : null}
  </div>;
}
