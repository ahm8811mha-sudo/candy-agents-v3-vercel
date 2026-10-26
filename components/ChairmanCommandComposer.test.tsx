import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChairmanCommandComposer from "./ChairmanCommandComposer";

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

describe("chairman command composer", () => {
  it("posts the employee, the priority, and links the tracking card", async () => {
    const posted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)));
      return jsonResponse({
        ok: true,
        command: {
          id: "cmd-ui",
          subject: "جهّز مقارنة 3 موردين للتغليف",
          status: "IN_PROGRESS",
          ownerAgentId: "khalid",
          ownerName: "خالد",
          currentStep: "جمع العروض",
          blockers: [],
          resultReport: "بدأ خالد الجمع.",
        },
      });
    }));

    render(<ChairmanCommandComposer />);
    const form = screen.getByRole("form", { name: "أمر رئيس مجلس الإدارة" });
    expect((form.querySelector("select[name=assignee]") as HTMLSelectElement).value).toBe("automatic");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "تلقائي", "سلطان", "عبدالرحمن", "نورة", "فهد", "سارة", "خالد", "ماجد", "راصد", "أمين", "حارس", "ريّان",
      "منخفضة", "متوسطة", "عالية", "عاجلة",
    ]);
    expect(screen.queryByRole("option", { name: "المالك" })).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: "الأمر" }), { target: { value: "جهّز مقارنة 3 موردين للتغليف" } });
    fireEvent.change(screen.getByRole("combobox", { name: "الموظف المسؤول" }), { target: { value: "khalid" } });
    fireEvent.change(screen.getByRole("combobox", { name: "الأولوية" }), { target: { value: "URGENT" } });
    fireEvent.click(screen.getByRole("button", { name: "إصدار الأمر" }));

    await waitFor(() => expect(posted).toEqual([{
      command: "جهّز مقارنة 3 موردين للتغليف",
      assignee: "khalid",
      priority: "URGENT",
    }]));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("خالد");
    expect(screen.getByRole("link", { name: "بطاقة المتابعة" }).getAttribute("href")).toBe("/commands#cmd-ui");
  });
});
