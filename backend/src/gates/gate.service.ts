import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaseSnapshot, CustomsSnap, DocSnap, GateResult, HsTemplateSnap } from '../common/types';
import { evaluateNode } from './gate.engine';
import { CustomersService } from '../customers/customers.service';

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
        procurementPlan: true,
        customs: true,
        sinosurePolicies: { orderBy: { createdAt: 'asc' } },
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
      kycRan: c.kycReports.some((k) => k.nodeCode === 'N1'),
      supplierScreened: hasSupplierScreen(c.kycReports, c.parties),
      contract: c.contract,
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
      procurementPlan: c.procurementPlan,
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
    };
  }

  async evaluateAndPersist(caseId: string, nodeCode: string): Promise<GateResult> {
    const snap = await this.snapshot(caseId);
    const result = evaluateNode(nodeCode, snap);
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
