"use client";

import { Crown } from "lucide-react";

export default function SessionControl() {
  return (
    <span className="mini-pill" title="نسخة شخصية خاصة بأحمد ناصر الأحمد">
      <Crown size={12} />
      <span className="hide-mobile">نسختي الخاصة</span>
    </span>
  );
}
