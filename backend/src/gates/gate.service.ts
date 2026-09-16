import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaseSnapshot, CustomsSnap, DocSnap, GateResult, HsTemplateSnap } from '../common/types';
import { evaluateNode } from './gate.engine';

@Injectable()
export class GateService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(caseId: string): Promise<CaseSnapshot> {
    const c = await this.prisma.tradeCase.findUniqueOrThrow({
      where: { id: caseId },
      include: {
        parties: true,
        hits: true,
        kycReports: { orderBy: { createdAt: 'desc' }, take: 1 },
        contract: true,
        shipment: true,
        documents: true,
        mismatchFixes: true,
        settlement: true,
        nodes: true,
        quotes: { orderBy: { version: 'asc' } },
        changeOrders: { include: { diffs: true }, orderBy: { createdAt: 'asc' } },
        productionPlan: true,
        customs: true,
        sinosurePolicies: { orderBy: { createdAt: 'asc' } },
      },
    });
    const goodsKey = normGoods(c.goodsDesc);
    const [floor, history, hsTpl] = await Promise.all([
      this.prisma.costFloor.findUnique({ where: { goodsKey } }),
      this.prisma.historicalPrice.findMany({ where: { goodsKey } }),
      c.customs?.hsCode
        ? this.prisma.hsTemplate.findUnique({ where: { hsCode: c.customs.hsCode } })
        : Promise.resolve(null),
    ]);
    return {
      parties: c.parties,
      hits: c.hits,
      kycRan: c.kycReports.length > 0,
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
      productionPlan: c.productionPlan,
      customs: c.customs ? toCustomsSnap(c.customs) : null,
      hsTemplate: hsTpl ? toHsSnap(hsTpl) : null,
      costFloorFen: floor?.floorFen ?? null,
      historyUnitPrices: history.map((h) => h.unitPriceFen),
      caseAmountFen: c.amountFen,
      caseCurrency: c.currency,
      sinosurePolicies: c.sinosurePolicies,
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
