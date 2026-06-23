"use client";

import { useEffect } from "react";

export default function NavFix() {
  useEffect(() => {
    const targets: Record<string, string> = {
      "لوحة القيادة": "dashboard",
      "الموظفون": "employees",
      "المهام": "tasks",
      "السجلات اليومية": "logs",
      "الموافقات": "approvals",
      "التقارير": "logs",
      "التنبيهات": "notifications",
    };
    const activate = () => {
      document.querySelectorAll<HTMLButtonElement>(".nav button").forEach((button) => {
        button.onclick = () => {
          const key = button.textContent?.trim() || "";
          const id = targets[key] || "dashboard";
          document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
        };
      });
    };
    activate();
    const timer = window.setTimeout(activate, 500);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
