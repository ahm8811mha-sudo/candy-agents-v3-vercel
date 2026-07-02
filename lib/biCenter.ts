import { getOperationalAlerts } from "./alertEngine";
import { getAccountingConsole } from "./proAccounting";
import { getCrmSalesOS } from "./crmSales";
import { getExecutiveOffice } from "./executiveOffice";
import { getGovernmentRelationsOS } from "./governmentRelations";
import { getMarketingOS } from "./marketingOS";
import { getProcurementInventoryOS } from "./procurementInventory";
import { getInbox } from "./inbox";

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getUnifiedBICenter() {
  const [finance, marketing, government, executive, crm, procurement, alerts, inbox] = await Promise.all([
    getAccountingConsole(),
    getMarketingOS(),
    getGovernmentRelationsOS(),
    getExecutiveOffice(),
    getCrmSalesOS(),
    getProcurementInventoryOS(),
    getOperationalAlerts(),
    getInbox().catch(() => ({ items: [], pending: 0 })),
  ]);

  const income = finance.statements.incomeStatement;
  const profitMargin = income.revenue > 0 ? income.netIncome / income.revenue : 0;
  const bestCampaign = (marketing.enterprise.marketingCampaigns || [])
    .map((campaign: any) => ({
      ...campaign,
      roas: number(campaign.actual_spend) > 0 ? number(campaign.actual_revenue) / number(campaign.actual_spend) : 0,
    }))
    .sort((a: any, b: any) => b.roas - a.roas)[0];
  const losingCampaigns = (marketing.enterprise.marketingCampaigns || []).filter((campaign: any) => {
    const roas = number(campaign.actual_spend) > 0 ? number(campaign.actual_revenue) / number(campaign.actual_spend) : 0;
    return number(campaign.actual_spend) > 0 && roas < (number(campaign.kpis?.roas_target) || 1.3);
  });
  const expiringDocs = (government.documents || []).filter((doc: any) => ["RENEWAL_SOON", "RENEWAL_URGENT", "EXPIRED"].includes(doc.status));
  const bestInventoryItem = (procurement.items || [])
    .map((item: any) => ({
      ...item,
      marginValue: Math.max(0, number(item.target_price) - number(item.unit_cost)) * number(item.on_hand),
    }))
    .sort((a: any, b: any) => b.marginValue - a.marginValue)[0];
  // The day's decision must be ACTIONABLE: text + a destination the owner can
  // click. Priority: critical alerts → pending sign-offs (/inbox) → no books
  // yet → losing campaigns → healthy margin (grow via ideas) → fix margin.
  const hasFinancialData = income.revenue > 0 || income.expenses > 0;
  const decision =
    alerts.metrics.critical > 0
      ? { text: "ابدأ بإغلاق التنبيهات الحرجة قبل أي توسع.", actionLabel: "افتح التنبيهات", href: "#bi-alerts" }
      : inbox.pending > 0
        ? { text: `لديك ${inbox.pending} قراراً بانتظار اعتمادك في مركز القرار.`, actionLabel: "افتح مركز القرار", href: "/inbox" }
        : !hasFinancialData
          ? { text: "لا توجد قيود مالية مسجّلة بعد — ابدأ بتسجيل عملياتك لتقرأ الشركة أرقامها الحقيقية.", actionLabel: "افتح المالية", href: "/departments/finance" }
          : losingCampaigns.length > 0
            ? { text: "أوقف أو عدّل الحملات الخاسرة قبل زيادة الميزانية.", actionLabel: "افتح التسويق", href: "/departments/marketing" }
            : profitMargin > 0.2
              ? { text: "الشركة قادرة على تجربة توسع صغير منضبط — راجع فكرة الفريق اليوم أو قدّم فكرتك.", actionLabel: "افتح الأفكار", href: "/ideas" }
              : { text: "ركّز على تحسين الهامش والتحصيل قبل التوسع.", actionLabel: "افتح المالية", href: "/departments/finance" };

  return {
    scorecard: {
      revenue: income.revenue,
      expenses: income.expenses,
      netIncome: income.netIncome,
      profitMargin,
      cash: finance.statements.cash,
      pipeline: crm.metrics.openPipeline,
      inventoryValue: procurement.metrics.inventoryValue,
      alertCount: alerts.metrics.open,
      pendingDecisions: inbox.pending,
      hasFinancialData,
    },
    answers: {
      isProfitable: income.netIncome > 0,
      bestProductOrOpportunity: bestCampaign?.name || bestInventoryItem?.name || "لا توجد بيانات كافية بعد.",
      expiringDocuments: expiringDocs.slice(0, 8),
      losingCampaigns,
      decisionToday: decision.text,
      decisionAction: { label: decision.actionLabel, href: decision.href },
    },
    departments: {
      finance: {
        taxPayable: finance.taxSummary.netTaxPayable,
        receivables: finance.statements.receivables,
        payables: finance.statements.payables,
        unmatchedBank: finance.reconciliation.unmatchedBank,
      },
      marketing: marketing.marketingBrief,
      government: government.metrics,
      executive: executive.operatingBrief,
      crm: crm.metrics,
      procurement: procurement.metrics,
      alerts: alerts.metrics,
    },
    alerts: alerts.alerts,
  };
}
