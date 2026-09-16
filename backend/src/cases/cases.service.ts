import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScreeningService } from '../screening/screening.service';
import { GateService } from '../gates/gate.service';
import {
  CaseStatus,
  Decision,
  Disposition,
  NODE_CATALOG,
  NodeStatus,
  PartyRoleLabel,
  RiskLevel,
} from '../common/constants';
import { nextMvpNode } from '../gates/gate.engine';
import {
  CreateCaseDto,
  SaveContractDto,
  SaveDocumentDto,
  SaveFixDto,
  SaveSettlementDto,
  SaveShipmentDto,
  UpsertPartyDto,
} from './dto';
import { GateResult } from '../common/types';

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly screening: ScreeningService,
    private readonly gates: GateService,
  ) {}

  async list() {
    return this.prisma.tradeCase.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        nodes: { orderBy: { code: 'asc' } },
        parties: true,
        hits: true,
      },
    });
  }

  async get(id: string) {
    const c = await this.prisma.tradeCase.findUnique({
      where: { id },
      include: {
        parties: true,
        nodes: { orderBy: { code: 'asc' } },
        hits: { include: { party: true } },
        kycReports: { orderBy: { createdAt: 'desc' }, take: 1 },
        contract: true,
        shipment: { include: { approver: true } },
        documents: true,
        mismatchFixes: true,
        settlement: true,
        gateChecks: { orderBy: { createdAt: 'desc' }, take: 8 },
      },
    });
    if (!c) throw new NotFoundException('案件不存在');
    return {
      ...c,
      catalog: NODE_CATALOG,
      kycReports: c.kycReports.map((k) => ({ ...k, payload: safeJson(k.payload) })),
      documents: c.documents.map((d) => ({ ...d, fields: safeJson(d.fieldsJson) })),
      gateChecks: c.gateChecks.map((g) => ({
        ...g,
        missing: safeJson(g.missingJson),
        reasons: safeJson(g.reasonsJson),
      })),
    };
  }

  async create(dto: CreateCaseDto, actorId?: string) {
    const seq = await this.prisma.tradeCase.count();
    const caseNo = `ERG-${String(seq + 1).padStart(4, '0')}`;
    const created = await this.prisma.tradeCase.create({
      data: {
        caseNo,
        title: dto.title,
        scenario: 'CUSTOM',
        status: CaseStatus.DRAFT,
        currentNode: 'N1',
        overallRisk: RiskLevel.LOW,
        goodsDesc: dto.goodsDesc,
        destination: dto.destination,
        amountFen: dto.amountFen,
        currency: dto.currency ?? 'USD',
        nodes: {
          create: NODE_CATALOG.map((n) => ({
            code: n.code,
            name: n.name,
            status: n.isStub ? NodeStatus.STUB_TODO : NodeStatus.NOT_STARTED,
            isStub: n.isStub,
            isHardGate: n.isHardGate,
            summary: n.summary,
          })),
        },
      },
    });
    await this.audit.append({
      caseId: created.id,
      actorId,
      action: 'CASE_CREATED',
      nodeCode: 'N1',
      detail: { caseNo, title: dto.title },
    });
    return this.get(created.id);
  }

  async upsertParty(caseId: string, dto: UpsertPartyDto, actorId?: string) {
    await this.ensureCase(caseId);
    const existing = await this.prisma.party.findFirst({
      where: { caseId, role: dto.role },
    });
    const party = existing
      ? await this.prisma.party.update({ where: { id: existing.id }, data: dto })
      : await this.prisma.party.create({ data: { caseId, ...dto } });
    await this.touchNode(caseId, 'N1', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'PARTY_UPSERT',
      nodeCode: 'N1',
      detail: { role: dto.role, name: dto.name },
    });
    return party;
  }

  async screenKyc(caseId: string, actorId?: string) {
    const c = await this.ensureCase(caseId);
    const parties = await this.prisma.party.findMany({ where: { caseId } });
    await this.prisma.screeningHit.deleteMany({ where: { caseId } });
    const allHits: Array<Record<string, unknown> & { score: number }> = [];
    for (const p of parties) {
      const matches = await this.screening.screenName(p.nameEn || p.name);
      for (const m of matches) {
        const hit = await this.prisma.screeningHit.create({
          data: {
            caseId,
            partyId: p.id,
            listCode: m.listCode,
            listedName: m.listedName,
            matchedName: m.matchedName,
            confidence: m.confidence,
            riskLevel: m.riskLevel,
            disposition: Disposition.OPEN,
            score: m.score,
            rawJson: JSON.stringify({ source: 'mock-blacklist', partyRole: p.role, ...m }),
          },
        });
        allHits.push({ ...hit, partyRole: p.role, partyName: p.name });
      }
    }
    const maxScore = allHits.reduce((s, h) => Math.max(s, h.score), 0);
    const riskLevel =
      maxScore >= 80 ? RiskLevel.HIGH : maxScore >= 50 ? RiskLevel.MEDIUM : maxScore > 0 ? RiskLevel.LOW : RiskLevel.LOW;
    const summary =
      allHits.length === 0
        ? '未命中 OFAC/UN/EU/UK 及中国不可靠实体清单（模拟库）。'
        : `共 ${allHits.length} 条命中，最高分 ${maxScore}，综合风险 ${riskLevel}。`;
    const report = await this.prisma.kycReport.create({
      data: {
        caseId,
        score: maxScore,
        riskLevel,
        summary,
        payload: JSON.stringify({
          parties: parties.map((p) => ({
            role: p.role,
            roleLabel: PartyRoleLabel[p.role],
            name: p.name,
            country: p.country,
          })),
          hits: allHits,
          lists: ['OFAC', 'UN', 'EU', 'UK', 'CN_UNRELIABLE'],
          disclaimer: '本筛查为本地模拟黑名单，未连接任何真实制裁数据供应商。',
        }),
      },
    });
    await this.prisma.tradeCase.update({
      where: { id: caseId },
      data: { overallRisk: riskLevel, status: CaseStatus.IN_PROGRESS },
    });
    await this.touchNode(caseId, 'N1', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'KYC_SCREENED',
      nodeCode: 'N1',
      detail: { score: maxScore, riskLevel, hitCount: allHits.length },
    });
    return { caseNo: c.caseNo, report: { ...report, payload: JSON.parse(report.payload) }, hits: allHits };
  }

  async saveContract(caseId: string, dto: SaveContractDto, actorId?: string) {
    await this.ensureCase(caseId);
    const row = await this.prisma.contract.upsert({
      where: { caseId },
      create: { caseId, ...dto },
      update: dto,
    });
    await this.touchNode(caseId, 'N3', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'CONTRACT_SAVED',
      nodeCode: 'N3',
      detail: dto,
    });
    return row;
  }

  async saveShipment(caseId: string, dto: SaveShipmentDto, actorId?: string) {
    await this.ensureCase(caseId);
    const row = await this.prisma.shipment.upsert({
      where: { caseId },
      create: { caseId, ...dto },
      update: dto,
    });
    await this.touchNode(caseId, 'N6', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'SHIPMENT_SAVED',
      nodeCode: 'N6',
      detail: dto,
    });
    return row;
  }

  async saveDocument(caseId: string, dto: SaveDocumentDto, actorId?: string) {
    await this.ensureCase(caseId);
    const existing = await this.prisma.tradeDocument.findFirst({
      where: { caseId, type: dto.type },
    });
    const data = {
      caseId,
      type: dto.type,
      isFinal: dto.isFinal ?? false,
      fieldsJson: JSON.stringify(dto.fields ?? {}),
    };
    const row = existing
      ? await this.prisma.tradeDocument.update({ where: { id: existing.id }, data })
      : await this.prisma.tradeDocument.create({ data });
    await this.touchNode(caseId, 'N7', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'DOCUMENT_SAVED',
      nodeCode: 'N7',
      detail: { type: dto.type, isFinal: dto.isFinal },
    });
    return { ...row, fields: dto.fields };
  }

  async saveFix(caseId: string, dto: SaveFixDto, actorId?: string) {
    await this.ensureCase(caseId);
    const row = await this.prisma.docMismatchFix.create({ data: { caseId, ...dto } });
    await this.audit.append({
      caseId,
      actorId,
      action: 'MISMATCH_FIX_RECORDED',
      nodeCode: 'N7',
      detail: dto,
    });
    return row;
  }

  async saveSettlement(caseId: string, dto: SaveSettlementDto, actorId?: string) {
    await this.ensureCase(caseId);
    const isThirdParty =
      dto.isThirdParty ?? dto.payerName.trim().toUpperCase() !== dto.buyerName.trim().toUpperCase();
    const row = await this.prisma.settlement.upsert({
      where: { caseId },
      create: { caseId, ...dto, isThirdParty },
      update: { ...dto, isThirdParty },
    });
    await this.touchNode(caseId, 'N9', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'SETTLEMENT_SAVED',
      nodeCode: 'N9',
      detail: dto,
    });
    return row;
  }

  async previewGate(caseId: string, nodeCode: string) {
    await this.ensureCase(caseId);
    return this.gates.evaluateAndPersist(caseId, nodeCode);
  }

  async advance(caseId: string, nodeCode: string, actorId?: string) {
    await this.ensureCase(caseId);
    const node = await this.prisma.caseNode.findUnique({
      where: { caseId_code: { caseId, code: nodeCode } },
    });
    if (!node) throw new NotFoundException('节点不存在');
    if (node.isStub) {
      await this.prisma.caseNode.update({
        where: { id: node.id },
        data: { status: NodeStatus.STUB_TODO, summary: node.summary },
      });
      const next = nextMvpNode(nodeCode);
      if (next) {
        await this.prisma.tradeCase.update({
          where: { id: caseId },
          data: { currentNode: next, status: CaseStatus.IN_PROGRESS },
        });
      }
      await this.audit.append({
        caseId,
        actorId,
        action: 'STUB_SKIPPED',
        nodeCode,
        detail: { todo: node.summary },
      });
      return { stub: true, message: node.summary, nextNode: next };
    }

    const result = await this.gates.evaluateAndPersist(caseId, nodeCode);
    await this.audit.append({
      caseId,
      actorId,
      action: result.canProceed ? 'NODE_ADVANCED' : 'GATE_REFUSED',
      nodeCode,
      detail: result,
    });
    if (!result.canProceed) {
      const blocked = result.decision === Decision.HARD_BLOCK;
      await this.prisma.caseNode.update({
        where: { id: node.id },
        data: {
          status: result.decision === Decision.REVIEW ? NodeStatus.REVIEW : NodeStatus.BLOCKED,
          decision: result.decision,
          summary: result.reasons.join('；'),
        },
      });
      if (blocked || result.decision === Decision.REVIEW) {
        await this.prisma.tradeCase.update({
          where: { id: caseId },
          data: {
            status: blocked ? CaseStatus.BLOCKED : CaseStatus.IN_PROGRESS,
            overallRisk: blocked ? RiskLevel.HIGH : RiskLevel.MEDIUM,
            currentNode: nodeCode,
          },
        });
      }
      throw new HttpException(
        {
          code: 'GATE_REFUSED',
          message: '闸门拒绝推进：证据不足或命中硬拦截',
          ...result,
        },
        HttpStatus.CONFLICT,
      );
    }

    await this.prisma.caseNode.update({
      where: { id: node.id },
      data: {
        status: NodeStatus.PASSED,
        decision: result.decision,
        summary: [...result.reasons, ...result.alerts].join('；'),
        completedAt: new Date(),
      },
    });
    const next = nextMvpNode(nodeCode);
    const done = nodeCode === 'N9';
    await this.prisma.tradeCase.update({
      where: { id: caseId },
      data: {
        currentNode: done ? 'N9' : next ?? nodeCode,
        status: done ? CaseStatus.COMPLETED : CaseStatus.IN_PROGRESS,
        overallRisk:
          result.decision === Decision.SOFT_ALERT ? RiskLevel.LOW : undefined,
      },
    });
    return { stub: false, result, nextNode: done ? null : next };
  }

  async applyWorkbench(caseId: string, input: { hitId?: string; action: string; comment?: string }, actorId?: string) {
    await this.ensureCase(caseId);
    let hit: { id: string; disposition: string } | null = null;
    if (input.hitId) {
      hit = await this.prisma.screeningHit.findUnique({ where: { id: input.hitId } });
      if (!hit) throw new NotFoundException('筛查命中不存在');
      const disposition =
        input.action === 'FALSE_POSITIVE'
          ? Disposition.FALSE_POSITIVE
          : input.action === 'CONFIRM_TRUE'
            ? Disposition.CONFIRMED_TRUE
            : input.action === 'MONITOR'
              ? Disposition.MONITORING
              : Disposition.SUPPLEMENTED;
      hit = await this.prisma.screeningHit.update({
        where: { id: input.hitId },
        data: { disposition },
      });
    }
    const action = await this.prisma.workbenchAction.create({
      data: {
        caseId,
        hitId: input.hitId,
        actorId,
        action: input.action,
        comment: input.comment,
      },
    });
    await this.audit.append({
      caseId,
      actorId,
      action: `WORKBENCH_${input.action}`,
      nodeCode: 'N1',
      detail: input,
    });
    const reeval: GateResult = await this.gates.evaluateAndPersist(caseId, 'N1');
    const n1Status =
      reeval.decision === Decision.HARD_BLOCK
        ? NodeStatus.BLOCKED
        : reeval.decision === Decision.REVIEW
          ? NodeStatus.REVIEW
          : NodeStatus.IN_PROGRESS;
    await this.prisma.caseNode.updateMany({
      where: { caseId, code: 'N1' },
      data: { status: n1Status, decision: reeval.decision, summary: reeval.reasons.join('；') },
    });
    await this.prisma.tradeCase.update({
      where: { id: caseId },
      data: {
        status: reeval.decision === Decision.HARD_BLOCK ? CaseStatus.BLOCKED : CaseStatus.IN_PROGRESS,
        overallRisk:
          reeval.decision === Decision.HARD_BLOCK
            ? RiskLevel.HIGH
            : reeval.decision === Decision.REVIEW
              ? RiskLevel.MEDIUM
              : RiskLevel.LOW,
      },
    });
    return { action, hit, n1: reeval };
  }

  private async ensureCase(id: string) {
    const c = await this.prisma.tradeCase.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('案件不存在');
    return c;
  }

  private async touchNode(caseId: string, code: string, status: string) {
    await this.prisma.caseNode.updateMany({
      where: { caseId, code, status: { not: NodeStatus.PASSED } },
      data: { status, startedAt: new Date() },
    });
  }
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
