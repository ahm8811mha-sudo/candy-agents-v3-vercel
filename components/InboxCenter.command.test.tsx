import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import InboxCenter from "./InboxCenter";

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("chairman command form", () => {
  it("posts the selected employee and keeps automatic as the default", async () => {
    const posted: unknown[] = [];
    const saved = {
      id: "cmd-ui",
      subject: "جهّز المقارنة",
      status: "IN_PROGRESS",
      ownerName: "خالد",
      currentStep: "جمع العروض",
      blockers: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/company/feed")) return jsonResponse({ ok: true, version: "v1" });
      if (url.includes("/api/commands")) {
        posted.push(JSON.parse(String(init?.body)));
        return jsonResponse({ ok: true, command: saved });
      }
      return jsonResponse({
        ok: true,
        items: [],
        pending: 0,
        commands: posted.length ? [saved] : [],
      });
    }));

    render(<InboxCenter />);
    const picker = await screen.findByRole("combobox", { name: "الموظف المسؤول" });
    expect((picker as HTMLSelectElement).value).toBe("automatic");
    expect(screen.getByRole("option", { name: "تلقائي" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "خالد" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "المالك" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "الأمر" }), { target: { value: "جهّز مقارنة موردين" } });
    fireEvent.change(picker, { target: { value: "khalid" } });
    fireEvent.click(screen.getByRole("button", { name: "إصدار الأمر" }));

    await waitFor(() => expect(posted).toEqual([{ command: "جهّز مقارنة موردين", assignee: "khalid" }]));
    expect(await screen.findByText("سُجّل الأمر.")).toBeTruthy();
    expect(await screen.findByText("جهّز المقارنة")).toBeTruthy();
  });
});
