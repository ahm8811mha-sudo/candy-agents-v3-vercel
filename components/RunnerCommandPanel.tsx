"use client";

import { MouseEvent, useState } from "react";
import { Keyboard, Loader2 } from "lucide-react";
import Image from "next/image";

type Props = {
  sessionId: string;
  shot?: string;
  onShot: (shot: string) => void;
  onMessage: (message: string) => void;
};

export default function RunnerCommandPanel({ sessionId, shot, onShot, onMessage }: Props) {
  const [working, setWorking] = useState(false);
  const [text, setText] = useState("");

  async function command(payload: Record<string, unknown>) {
    setWorking(true);
    const res = await fetch("/api/browser-runner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "command", sessionId, ...payload }),
    });
    const json = await res.json();
    const nextShot = json.runner?.session?.screenshot;
    if (nextShot) onShot(nextShot);
    onMessage(json.ok ? "تم تنفيذ الأمر وتحديث اللقطة." : json.runner?.error || json.error || "تعذر تنفيذ الأمر.");
    setWorking(false);
  }

  function imagePoint(event: MouseEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const rect = image.getBoundingClientRect();
    command({
      kind: "point",
      x: Math.round(((event.clientX - rect.left) / rect.width) * image.naturalWidth),
      y: Math.round(((event.clientY - rect.top) / rect.height) * image.naturalHeight),
    });
  }

  if (!shot) return null;

  return (
    <div className="statement-list">
      <Image
        alt="runner view"
        src={`data:image/jpeg;base64,${shot}`}
        width={1280}
        height={720}
        unoptimized
        onClick={imagePoint}
        style={{ width: "100%", height: "auto", borderRadius: 16, border: "1px solid var(--line)", cursor: "crosshair" }}
      />
      <div className="form-command-row">
        <button className="secondary-btn" type="button" disabled={working} onClick={() => command({ kind: "key", key: "Tab" })}><Keyboard size={15} /> Tab</button>
        <button className="secondary-btn" type="button" disabled={working} onClick={() => command({ kind: "key", key: "Backspace" })}>Backspace</button>
        <button className="secondary-btn" type="button" disabled={working} onClick={() => command({ kind: "wheel", deltaY: 700 })}>أسفل</button>
        <button className="secondary-btn" type="button" disabled={working} onClick={() => command({ kind: "wheel", deltaY: -700 })}>أعلى</button>
      </div>
      <div className="form-command-row">
        <input className="input" value={text} onChange={(event) => setText(event.target.value)} placeholder="نص لإدخاله في الحقل المحدد" />
        <button className="primary-btn" type="button" disabled={working || !text} onClick={() => command({ kind: "text", text })}>{working ? <Loader2 className="spin" size={15} /> : null} كتابة</button>
      </div>
    </div>
  );
}
