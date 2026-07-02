/**
 * Configurable Saudi broker adapter.
 *
 * Tadawul has no public direct-access API; real execution must go through a
 * CMA-licensed broker. This adapter is a generic REST bridge that stays inert
 * until the operator supplies a licensed broker's endpoint and credentials
 * (SAUDI_BROKER_API_URL + SAUDI_BROKER_API_KEY). Until then every order is
 * simulated. The exact request shape is broker-specific and intentionally
 * minimal here — it is wired once a real broker contract/API is available.
 */

export function isSaudiBrokerConfigured(): boolean {
  return Boolean(process.env.SAUDI_BROKER_API_URL && process.env.SAUDI_BROKER_API_KEY);
}

export function saudiBrokerName(): string {
  return process.env.SAUDI_BROKER_NAME || "وسيط سعودي";
}

export type SaudiOrderInput = {
  symbol: string; // 4-digit Tadawul code, e.g. "2222"
  qty: number;
  side: "buy" | "sell";
};

export type SaudiOrderResult = {
  submitted: boolean;
  simulated: boolean;
  orderId?: string;
  reason: string;
};

export async function submitSaudiOrder(order: SaudiOrderInput): Promise<SaudiOrderResult> {
  if (!isSaudiBrokerConfigured()) {
    return {
      submitted: false,
      simulated: true,
      reason: "لا يوجد وسيط سعودي مُهيّأ — تم تسجيل الأمر كمحاكاة. التنفيذ الحقيقي يتطلب API من وسيط مرخّص.",
    };
  }

  try {
    const res = await fetch(`${process.env.SAUDI_BROKER_API_URL}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SAUDI_BROKER_API_KEY}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({ symbol: order.symbol, quantity: order.qty, side: order.side, market: "TADAWUL" }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Saudi broker API ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string; orderId?: string };
    return {
      submitted: true,
      simulated: false,
      orderId: data.id || data.orderId,
      reason: `تم إرسال الأمر إلى ${saudiBrokerName()}`,
    };
  } catch (e) {
    return { submitted: false, simulated: false, reason: e instanceof Error ? e.message : "فشل إرسال الأمر للوسيط السعودي" };
  }
}
