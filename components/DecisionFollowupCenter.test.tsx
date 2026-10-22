import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DecisionFollowupCenter from "./DecisionFollowupCenter";

const commitment = (over: Record<string, unknown> = {}) => ({
  id: "c1", title: "توقيع عقد المورد", detail: null, status: "IN_PROGRESS", priority: "HIGH", assigneeId: "fahad",
  assigneeName: "فهد", decidedBy: "سلطان", dueAt: null, reminderCount: 0, escalated: false, requiresProof: true,
  overdue: false, needsOwner: false, ...over,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

function server(items: unknown[]) {
  const posts: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method !== "POST") return json({ ok: true, commitments: items, brief: null });
    posts.push(JSON.parse(String(init.body)));
    return json({ ok: true });
  }));
  return posts;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("closing a decision", () => {
  it("asks for the proof in a labelled field, never a browser prompt", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
    const posts = server([commitment()]);
    render(<DecisionFollowupCenter />);

    fireEvent.click(await screen.findByRole("button", { name: /تم الإنجاز/ }));
    const field = screen.getByLabelText("دليل الإتمام");
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));
    expect(await screen.findByText("الإغلاق يتطلب دليلاً لهذا القرار.")).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(posts).toHaveLength(0);

    fireEvent.change(field, { target: { value: "رقم العقد 4471" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));
    await waitFor(() => expect(posts).toEqual([{ id: "c1", status: "COMPLETED", completionNote: "رقم العقد 4471" }]));
    expect(prompt).not.toHaveBeenCalled();
  });

  it("closes a decision with no real-world effect on an optional note", async () => {
    const posts = server([commitment({ requiresProof: false })]);
    render(<DecisionFollowupCenter />);

    fireEvent.click(await screen.findByRole("button", { name: /تم الإنجاز/ }));
    expect(screen.getByLabelText("ملاحظة الإتمام (اختيارية)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد الإغلاق" }));
    await waitFor(() => expect(posts).toEqual([{ id: "c1", status: "COMPLETED", completionNote: "" }]));
  });

  it("cancelling folds the form away and sends nothing", async () => {
    const posts = server([commitment()]);
    render(<DecisionFollowupCenter />);

    const close = await screen.findByRole("button", { name: /تم الإنجاز/ });
    fireEvent.click(close);
    expect(close.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByLabelText("دليل الإتمام")).toBeNull();
    expect(close.getAttribute("aria-expanded")).toBe("false");
    expect(posts).toHaveLength(0);
  });
});
