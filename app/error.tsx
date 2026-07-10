"use client";

import { useEffect } from "react";
import OrvantaLogo from "@/components/OrvantaLogo";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Orvanta route error", error);
  }, [error]);

  return (
    <section className="brand-error" role="alert">
      <div className="brand-state-card">
        <OrvantaLogo size={220} priority />
        <h1>تعذّر فتح هذه الشاشة</h1>
        <p>حدث خطأ غير متوقع. لم تُحذف بياناتك، ويمكنك إعادة المحاولة الآن.</p>
        <button className="primary-btn" type="button" onClick={reset}>
          إعادة المحاولة
        </button>
      </div>
    </section>
  );
}
