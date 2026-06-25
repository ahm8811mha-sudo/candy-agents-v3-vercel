import { getOperationalAlerts } from "./alertEngine";
import { getAccountingConsole } from "./proAccounting";
import { getCrmSalesOS } from "./crmSales";
import { getExecutiveOffice } from "./executiveOffice";
import { getGovernmentRelationsOS } from "./governmentRelations";
import { getMarketingOS } from "./marketingOS";
import { getProcurementInventoryOS } from "./procurementInventory";

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getUnifiedBICenter() {
  const [finance, marketing, government, executive, crm, procurement, alerts] = await Promise.all([
    getAccountingConsole(),
    getMarketingOS(),
    getGovernmentRelationsOS(),
    getExecutiveOffice(),
    getCrmSalesOS(),
    getProcurementInventoryOS(),
    getOperationalAlerts(),
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
  const decisionToday =
    alerts.metrics.critical > 0
      ? "ابدأ بإغلاق التنبيهات الحرجة قبل أي توسع."
      : executive.operatingBrief.waitingApprovals > 0
        ? "راجع الاعتمادات المعلقة في مكتب CEO."
        : losingCampaigns.length > 0
          ? "أوقف أو عدل الحملات الخاسرة قبل زيادة الميزانية."
          : profitMargin > 0.2
            ? "الشركة قادرة على تجربة توسع صغير منضبط."
            : "ركز على تحسين الهامش والتحصيل قبل التوسع.";

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
    },
    answers: {
      isProfitable: income.netIncome > 0,
      bestProductOrOpportunity: bestCampaign?.name || bestInventoryItem?.name || "لا توجد بيانات كافية بعد.",
      expiringDocuments: expiringDocs.slice(0, 8),
      losingCampaigns,
      decisionToday,
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
