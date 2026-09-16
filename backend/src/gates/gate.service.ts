import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CaseSnapshot, DocSnap, GateResult } from '../common/types';
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
      },
    });
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

function safeObj(raw: string): Record<string, string | number | null> {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
