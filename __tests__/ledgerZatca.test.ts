import { describe, it, expect, beforeEach } from "vitest";
import { postEntry, postSale, trialBalance, ledgerTotals, _clearLedger } from "../lib/company/ledger";
import { splitVatInclusive, buildZatcaQr, buildInvoice, VAT_RATE, _clearInvoices } from "../lib/company/zatca";

describe("ZATCA VAT", () => {
  beforeEach(() => _clearInvoices());

  it("splits a VAT-inclusive gross into net + 15% VAT", () => {
    const { net, vat, gross } = splitVatInclusive(115);
    expect(net).toBe(100);
    expect(vat).toBe(15);
    expect(gross).toBe(115);
    expect(VAT_RATE).toBe(0.15);
  });

  it("net + vat always reconstructs the gross", () => {
    for (const g of [99.99, 250, 1040, 7.5]) {
      const s = splitVatInclusive(g);
      expect(Math.round((s.net + s.vat) * 100) / 100).toBe(s.gross);
    }
  });

  it("builds a decodable base64 TLV QR (tag 1 = seller name)", () => {
    const qr = buildZatcaQr({ sellerName: "شركة", vatNumber: "300000000000003", timestamp: "2026-07-05T00:00:00Z", invoiceTotal: 115, vatTotal: 15 });
    const buf = Buffer.from(qr, "base64");
    expect(buf.length).toBeGreaterThan(0);
    expect(buf[0]).toBe(1); // first tag
  });

  it("builds a ZATCA invoice with number, VAT split and QR", () => {
    const inv = buildInvoice({ gross: 230, currency: "SAR", reference: "x" });
    expect(inv.invoiceNumber).toMatch(/^INV-\d{4}-\d{5}$/);
    expect(inv.netAmount).toBe(200);
    expect(inv.vatAmount).toBe(30);
    expect(inv.totalAmount).toBe(230);
    expect(inv.qr.length).toBeGreaterThan(0);
  });
});

describe("double-entry ledger", () => {
  beforeEach(() => _clearLedger());

  it("posts a balanced sale (Cash = Revenue + VAT)", () => {
    const entry = postSale(115, "ref-1");
    expect(entry.net).toBe(100);
    expect(entry.vat).toBe(15);
    const tb = trialBalance();
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
  });

  it("rejects an unbalanced entry", () => {
    expect(() =>
      postEntry({ description: "خطأ", lines: [{ account: "A", debit: 100, credit: 0 }, { account: "B", debit: 0, credit: 90 }] })
    ).toThrow(/Unbalanced/);
  });

  it("aggregates totals across sales", () => {
    _clearLedger();
    postSale(115, "r1");
    postSale(230, "r2");
    const t = ledgerTotals();
    expect(t.revenue).toBe(300); // 100 + 200
    expect(t.vatPayable).toBe(45); // 15 + 30
    expect(t.cash).toBe(345);
  });
});
