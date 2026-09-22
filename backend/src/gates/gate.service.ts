import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaseSnapshot, CustomsSnap, DocSnap, GateResult, HsTemplateSnap } from '../common/types';
import { evaluateNode } from './gate.engine';
import { CustomersService } from '../customers/customers.service';
import { isSalesContractSigned, n3StatusOf } from '../cases/sales-link';
import { OccupancyReviewStatus, occupancyFingerprint, planOccupancyReviewSync } from '../workbench/occupancy-review';
import { parseDirectPort, planTaxFinanceReviewSync, TaxFinanceReviewStatus } from '../tax-finance/tax-finance';

@Injectable()
export class GateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {}

  async snapshot(caseId: string): Promise<CaseSnapshot> {
    const c = await this.prisma.tradeCase.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        parties: true,
        hits: { include: { party: true } },
        kycReports: { orderBy: { createdAt: 'desc' } },
        contract: true,
        shipment: true,
        documents: true,
        mismatchFixes: true,
        settlement: true,
        nodes: true,
        quotes: { orderBy: { version: 'asc' } },
        changeOrders: { include: { diffs: true }, orderBy: { createdAt: 'asc' } },
        procurementPlan: { include: { salesCase: { include: { contract: true, nodes: true, parties: true } } } },
        customs: true,
        sinosurePolicies: { orderBy: { createdAt: 'asc' } },
        occupancyReviews: { orderBy: { createdAt: 'asc' } },
        taxFinanceReviews: { orderBy: { createdAt: 'asc' } },
        taxRebateChecklist: true,
      },
    });
    const goodsKey = normGoods(c.goodsDesc);
    const [floor, history, hsTpl, occ] = await Promise.all([
      this.prisma.costFloor.findUnique({ where: { goodsKey } }),
      this.prisma.historicalPrice.findMany({ where: { goodsKey } }),
      c.customs?.hsCode
        ? this.prisma.hsTemplate.findUnique({ where: { hsCode: c.customs.hsCode } })
        : Promise.resolve(null),
      this.customers.occupancyForCase(caseId),
    ]);
    return {
      parties: c.parties,
      hits: c.hits.map((h) => ({
        listCode: h.listCode,
        listedName: h.listedName,
        matchedName: h.matchedName,
        confidence: h.confidence,
        riskLevel: h.riskLevel,
        disposition: h.disposition,
        score: h.score,
        partyRole: h.party?.role ?? null,
        nodeCode: h.nodeCode,
      })),
      kycRan: c.kycReports.some((k) => k.nodeCode === 'N3' || k.nodeCode === 'N1'),
      supplierScreened: hasSupplierScreen(c.kycReports, c.parties),
      contract: c.contract
        ? {
            ...c.contract,
            directPort: parseDirectPort(c.contract.directPortJson),
          }
        : null,
      shipment: c.shipment,
      documents: c.documents.map(
        (d): DocSnap => ({
          type: d.type,
          isFinal: d.isFinal,
          fields: safeObj(d.fieldsJson),
        }),
      ),
      mismatchFixes: c.mismatchFixes,
      settlement: c.settlement,
      nodes: c.nodes,
      quotes: c.quotes,
      changeOrders: c.changeOrders.map((co) => ({
        ...co,
        diffs: co.diffs,
      })),
      procurementPlan: c.procurementPlan
        ? {
            poNo: c.procurementPlan.poNo,
            plannedArrival: c.procurementPlan.plannedArrival,
            contractDelivery:
              c.procurementPlan.salesCase?.contract?.deliveryDate ||
              c.procurementPlan.contractDelivery ||
              c.contract?.deliveryDate ||
              null,
            poEvidenceStub: c.procurementPlan.poEvidenceStub,
            poEvidenceId: c.procurementPlan.poEvidenceId,
            delayRegistered: c.procurementPlan.delayRegistered,
            delayTriggerCode: c.procurementPlan.delayTriggerCode,
            delayTriggerRef: c.procurementPlan.delayTriggerRef,
            delayReason: c.procurementPlan.delayReason,
            customerConsent: c.procurementPlan.customerConsent,
            customerConsentEvidenceId: c.procurementPlan.customerConsentEvidenceId,
            actualArrival: c.procurementPlan.actualArrival,
            amountFen: c.procurementPlan.amountFen,
            currency: c.procurementPlan.currency,
            paidFen: c.procurementPlan.paidFen,
            paymentDueAt: c.procurementPlan.paymentDueAt,
            paidAt: c.procurementPlan.paidAt,
            paymentMode: c.procurementPlan.paymentMode,
            salesCaseId: c.procurementPlan.salesCaseId,
            salesCaseNo: c.procurementPlan.salesCase?.caseNo ?? null,
            salesContractSigned: isSalesContractSigned({
              currentNode: c.procurementPlan.salesCase?.currentNode,
              n3Status: n3StatusOf(c.procurementPlan.salesCase?.nodes),
              hasContract: !!c.procurementPlan.salesCase?.contract,
            }),
          }
        : null,
      customs: c.customs ? toCustomsSnap(c.customs) : null,
      hsTemplate: hsTpl ? toHsSnap(hsTpl) : null,
      costFloorFen: floor?.floorFen ?? null,
      historyUnitPrices: history.map((h) => h.unitPriceFen),
      caseAmountFen: c.amountFen,
      caseCurrency: c.currency,
      sinosurePolicies: c.sinosurePolicies,
      sinosureOccupancy: {
        openUnpaidFen: occ.openUnpaidFen,
        fulfilledUnpaidFen: occ.fulfilledUnpaidFen,
      },
      occupancyReviews: (c.occupancyReviews || []).map((row) => ({
        id: row.id,
        nodeCode: row.nodeCode,
        status: row.status,
        band: row.band,
        occupancyFen: row.occupancyFen,
        excessFen: row.excessFen,
        insuredLimitFen: row.insuredLimitFen,
        fingerprint: row.fingerprint,
        claimedById: row.claimedById,
        comment: row.comment,
      })),
      taxFinanceReviews: (c.taxFinanceReviews || []).map((row) => ({
        id: row.id,
        nodeCode: row.nodeCode,
        status: row.status,
        band: row.band,
        reasonCode: row.reasonCode,
        summary: row.summary,
        fingerprint: row.fingerprint,
        claimedById: row.claimedById,
        comment: row.comment,
      })),
      taxRebate: c.taxRebateChecklist
        ? {
            inputInvoiceNo: c.taxRebateChecklist.inputInvoiceNo,
            flowGoods: c.taxRebateChecklist.flowGoods,
            flowCustoms: c.taxRebateChecklist.flowCustoms,
            flowInvoice: c.taxRebateChecklist.flowInvoice,
            flowRemittance: c.taxRebateChecklist.flowRemittance,
            declaredAt: c.taxRebateChecklist.declaredAt,
          }
        : null,
      caseGoodsDesc: c.goodsDesc,
      salesContract: salesSideOf(c),
    };
  }

  async evaluateAndPersist(caseId: string, nodeCode: string): Promise<GateResult> {
    const snap = await this.snapshot(caseId);
    const result = evaluateNode(nodeCode, snap);
    await this.syncOccupancyReview(caseId, result, snap.occupancyReviews);
    await this.syncTaxFinanceReview(caseId, result, snap.taxFinanceReviews);
    await this.prisma.gateCheck.create({
      data: {
        caseId,
        nodeCode,
        decision: result.decision,
        canProceed: result.canProceed,
        missingJson: JSON.stringify(result.missing),
        reasonsJson: JSON.stringify(result.reasons),
      },
    });
    return result;
  }

  async refreshOccupancyReview(caseId: string, nodeCode: string): Promise<GateResult> {
    const snap = await this.snapshot(caseId);
    const result = evaluateNode(nodeCode, snap);
    await this.syncOccupancyReview(caseId, result, snap.occupancyReviews);
    await this.syncTaxFinanceReview(caseId, result, snap.taxFinanceReviews);
    return result;
  }

  async refreshTaxFinanceReview(caseId: string, nodeCode: string): Promise<GateResult> {
    return this.refreshOccupancyReview(caseId, nodeCode);
  }

  private async syncOccupancyReview(
    caseId: string,
    result: GateResult,
    reviews: CaseSnapshot['occupancyReviews'],
  ) {
    if (result.nodeCode !== 'N3' && result.nodeCode !== 'N4') return;
    const exp = result.exposure;
    if (!exp) {
      const plan = planOccupancyReviewSync(reviews, result.nodeCode, { band: null });
      if (plan.supersedeIds.length) {
        await this.prisma.occupancyReview.updateMany({
          where: { id: { in: plan.supersedeIds } },
          data: { status: OccupancyReviewStatus.SUPERSEDED },
        });
      }
      return;
    }
    const plan = planOccupancyReviewSync(reviews, result.nodeCode, exp);
    if (plan.supersedeIds.length) {
      await this.prisma.occupancyReview.updateMany({
        where: { id: { in: plan.supersedeIds } },
        data: { status: OccupancyReviewStatus.SUPERSEDED },
      });
    }
    if (plan.create) {
      await this.prisma.occupancyReview.create({
        data: {
          caseId,
          ...plan.create,
          fingerprint: plan.create.fingerprint || occupancyFingerprint(plan.create),
        },
      });
    }
  }

  private async syncTaxFinanceReview(
    caseId: string,
    result: GateResult,
    reviews: CaseSnapshot['taxFinanceReviews'],
  ) {
    if (!['N3', 'N5', 'N6', 'N7', 'N8'].includes(result.nodeCode)) return;
    const view = result.taxFinance;
    const plan = planTaxFinanceReviewSync(reviews, result.nodeCode, view?.band ? view : null);
    if (plan.supersedeIds.length) {
      await this.prisma.taxFinanceReview.updateMany({
        where: { id: { in: plan.supersedeIds } },
        data: { status: TaxFinanceReviewStatus.SUPERSEDED },
      });
    }
    if (plan.create) {
      await this.prisma.taxFinanceReview.create({
        data: {
          caseId,
          ...plan.create,
        },
      });
    }
  }
}

function salesSideOf(c: {
  contract?: {
    deliveryMode?: string | null;
    goodsDesc?: string | null;
    amountFen?: number | null;
    quantity?: number | null;
    currency?: string | null;
    directPortJson?: string | null;
    consigneeName?: string | null;
    buyerName?: string | null;
  } | null;
  procurementPlan?: {
    salesCase?: {
      contract?: {
        deliveryMode?: string | null;
        goodsDesc?: string | null;
        amountFen?: number | null;
        quantity?: number | null;
        currency?: string | null;
        directPortJson?: string | null;
        consigneeName?: string | null;
        buyerName?: string | null;
      } | null;
    } | null;
  } | null;
}) {
  const row = c.procurementPlan?.salesCase?.contract || c.contract;
  if (!row) return null;
  return {
    deliveryMode: row.deliveryMode,
    goodsDesc: row.goodsDesc,
    amountFen: row.amountFen,
    quantity: row.quantity,
    currency: row.currency,
    directPort: parseDirectPort(row.directPortJson),
    consigneeName: row.consigneeName,
    buyerName: row.buyerName,
  };
}

export function normGoods(desc: string) {
  return desc.replace(/\s+/g, '').toLowerCase();
}

function hasSupplierScreen(
  reports: { nodeCode: string; payload: string }[],
  parties: { role: string; name: string }[],
): boolean {
  const supplier = parties.find((p) => p.role === 'SUPPLIER' && p.name.trim());
  if (!supplier) return false;
  const want = supplier.name.trim().toUpperCase();
  return reports.some((k) => {
    if (k.nodeCode !== 'N5') return false;
    try {
      const payload = JSON.parse(k.payload) as { parties?: { name?: string }[] };
      return (payload.parties || []).some((p) => String(p.name || '').trim().toUpperCase() === want);
    } catch {
      return false;
    }
  });
}

function toCustomsSnap(row: {
  hsCode: string | null;
  productName: string | null;
  declareElementsJson: string;
  originCountry: string | null;
  originEvidenceType: string | null;
  originEvidenceRef: string | null;
  originEvidenceId: string | null;
  unit: string | null;
  exportTaxName: string | null;
  eportStatus: string;
}): CustomsSnap {
  return {
    hsCode: row.hsCode,
    productName: row.productName,
    declareElements: safeObj(row.declareElementsJson) as Record<string, string>,
    originCountry: row.originCountry,
    originEvidenceType: row.originEvidenceType,
    originEvidenceRef: row.originEvidenceRef,
    originEvidenceId: row.originEvidenceId,
    unit: row.unit,
    exportTaxName: row.exportTaxName,
    eportStatus: row.eportStatus,
  };
}

function toHsSnap(row: {
  hsCode: string;
  productName: string;
  requiredElementsJson: string;
  unit: string;
  exportTaxName: string;
}): HsTemplateSnap {
  const els = safeArr(row.requiredElementsJson);
  return {
    hsCode: row.hsCode,
    productName: row.productName,
    requiredElements: els,
    unit: row.unit,
    exportTaxName: row.exportTaxName,
  };
}

function safeObj(raw: string): Record<string, string | number | null> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function safeArr(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
