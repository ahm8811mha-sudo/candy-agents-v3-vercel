"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, UserRound } from "lucide-react";
import Link from "next/link";

type SessionUser = {
  name: string;
  email: string;
  role: string;
  tenantId: string;
};

export default function SessionControl() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadSession() {
      try {
        const response = await fetch("/api/auth", { cache: "no-store" });
        const json = response.ok ? await response.json() : null;
        if (!active) return;
        setUser(json?.ok ? json.user : null);
      } finally {
        if (active) setLoaded(true);
      }
    }

    void loadSession();
    const timer = window.setInterval(loadSession, 45 * 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    window.location.href = "/login";
  }

  if (!loaded) return null;
  if (!user) {
    return (
      <Link className="secondary-btn btn-sm" href="/login" aria-label="تسجيل الدخول">
        <LogIn size={14} />
        <span className="hide-mobile">دخول</span>
      </Link>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span className="mini-pill hide-mobile" title={`${user.email} · ${user.tenantId}`}>
        <UserRound size={12} /> {user.name || user.email} · {user.role}
      </span>
      <button className="secondary-btn btn-sm" type="button" onClick={logout} aria-label="تسجيل الخروج">
        <LogOut size={14} />
        <span className="hide-mobile">خروج</span>
      </button>
    </div>
  );
}
