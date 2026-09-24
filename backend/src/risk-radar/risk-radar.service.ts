import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { AuditService } from '../audit/audit.service';
import { UserRole, n7OriginCertRequired } from '../common/constants';
import { CaseSnapshot } from '../common/types';
import { normalizeDemoRole } from '../auth/roles';
import {
  batchCountsAsShipped,
  contractOccupancyPortions,
  receivedFenForBatch,
} from '../cases/shipment-batch';
import { evaluateBuyerOccupancy, isUsd } from '../customers/sinosure-exposure';
import { effectiveN6Incoterms } from '../gates/gate.engine';
import { PrismaService } from '../prisma/prisma.service';
import { scoreOf, riskFromScore } from '../screening/matcher';
import { ScreeningService } from '../screening/screening.service';
import { clearSampleData, generateSampleData } from './risk-sample';
import {
  RiskConclusion,
  RiskStatus,
  RiskStatusLabel,
  RiskType,
  RiskTypeLabel,
  RiskColorLabel,
  batchCollected,
  compareRiskQueue,
  diffScreeningMatches,
  dispositionError,
  docMissingFinding,
  occupancyFinding,
  overdueFinding,
  parseDueDate,
  quotaFromLimits,
  receivableDueDate,
  SEVERITY_REOPEN_CODE,
  sanctionFindings,
  supplementContents,
  syncRiskState,
  utcDaysPast,
  addUtcDays,
  type RiskFinding,
  type RiskLine,
  type StoredRisk,
} from './risk-rules';

export type DemoActor = { id: string; name: string; role: string };

const UPLOAD_MAX = 15 * 1024 * 1024;

/** 演示仓库默认允许示例数据。RISK_SAMPLE_ENABLED=0 时关闭生成、清除和改截止日。 */
export function riskSampleEnabled(): boolean {
  const flag = String(process.env.RISK_SAMPLE_ENABLED ?? '').trim().toLowerCase();
  if (flag === '0' || flag === 'false' || flag === 'off') return false;
  return true;
}

@Injectable()
export class RiskRadarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly screening: ScreeningService,
    private readonly audit: AuditService,
  ) {}

  async list(actor: DemoActor) {
    this.assertRadarReader(actor);
    await this.recalculate();
    return this.presentList(actor);
  }

  async refresh(actor: DemoActor) {
    this.assertRadarReader(actor);
    await this.recalculate();
    return this.presentList(actor);
  }

  async mine(actor: DemoActor) {
    if (normalizeDemoRole(actor.role) !== UserRole.SALES) {
      throw new ForbiddenException('我的风险和补件只开放给业务岗');
    }
    const logs = await this.prisma.auditLog.findMany({
      where: { action: 'CASE_CREATED', actorId: actor.id },
      select: { caseId: true },
    });
    const caseIds = [...new Set(logs.map((row) => row.caseId).filter((id): id is string => !!id))];
    const rows = caseIds.length
      ? await this.prisma.riskItem.findMany({
          where: { caseId: { in: caseIds }, status: { not: RiskStatus.SYSTEM_CLOSED } },
          include: {
            case: { select: { caseNo: true } },
            supplements: { orderBy: { createdAt: 'asc' } },
          },
          orderBy: { firstSeenAt: 'asc' },
        })
      : [];
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        typeLabel: RiskTypeLabel[row.type] || row.type,
        color: row.color,
        colorLabel: RiskColorLabel[row.color] || row.color,
        status: row.status,
        statusLabel: RiskStatusLabel[row.status] || row.status,
        caseNo: row.case?.caseNo || row.subjectLabel,
        caseId: row.caseId,
        supplements: row.supplements.map(presentTask),
      })),
    };
  }

  async open(actor: DemoActor, id: string) {
    this.assertRadarReader(actor);
    const row = await this.prisma.riskItem.findUnique({
      where: { id },
      include: {
        processingBy: { select: { id: true, name: true } },
        supplements: { orderBy: { createdAt: 'asc' } },
        actions: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true } } } },
        case: { select: { caseNo: true } },
      },
    });
    if (!row || row.status === RiskStatus.SYSTEM_CLOSED) throw new NotFoundException('风险不存在');

    const terminal = row.status === RiskStatus.RESOLVED || row.status === RiskStatus.REJECTED;
    let processingBy = row.processingBy;
    let processingByOther = false;
    if (!terminal && (!row.processingById || row.processingById === actor.id)) {
      const started = row.processingById === actor.id && row.processingStartedAt ? row.processingStartedAt : new Date();
      const updated = await this.prisma.riskItem.update({
        where: { id },
        data: { processingById: actor.id, processingStartedAt: started },
        include: { processingBy: { select: { id: true, name: true } } },
      });
      processingBy = updated.processingBy;
    } else {
      processingByOther = true;
    }

    await this.prisma.riskView.upsert({
      where: { riskId_userId: { riskId: id, userId: actor.id } },
      create: { riskId: id, userId: actor.id },
      update: { seenAt: new Date() },
    });

    return {
      ...this.toCard(row, true),
      caseNo: row.case?.caseNo || null,
      lines: parseLines(row.linesJson),
      supplements: row.supplements.map(presentTask),
      actions: row.actions.map((action) => ({
        id: action.id,
        conclusion: action.conclusion,
        conclusionLabel: conclusionLabelOf(action.conclusion),
        reason: action.reason,
        createdAt: action.createdAt,
        actorName: action.actor?.name || (action.conclusion === RiskConclusion.REOPENED ? '系统' : ''),
      })),
      workbenchTab: workbenchTabOf(row.type),
      sampleEnabled: riskSampleEnabled(),
      processingBy: processingBy ? { id: processingBy.id, name: processingBy.name } : null,
      processingByOther,
      seen: true,
    };
  }

  async act(
    actor: DemoActor,
    id: string,
    input: { conclusion?: string; reason?: string; dueAt?: string | null },
  ) {
    this.assertRadarReader(actor);
    const conclusion = String(input.conclusion || '').trim().toUpperCase();
    const reason = String(input.reason || '').trim();
    if (!reason) throw new BadRequestException('请填写处置理由');
    const row = await this.prisma.riskItem.findUnique({ where: { id }, include: { supplements: true } });
    if (!row || row.status === RiskStatus.SYSTEM_CLOSED) throw new NotFoundException('风险不存在');
    const denied = dispositionError(row.color, conclusion);
    if (denied) throw new BadRequestException(denied);
    if (row.status === RiskStatus.RESOLVED || row.status === RiskStatus.REJECTED) {
      throw new BadRequestException('这条风险已经处置完');
    }

    const now = new Date();
    if (conclusion === RiskStatus.CONDITIONAL_RELEASE) {
      const dueAt = parseDueDate(input.dueAt, now);
      const contents = supplementContents(parseLines(row.linesJson));
      await this.prisma.supplementTask.deleteMany({ where: { riskId: id } });
      await this.prisma.supplementTask.createMany({
        data: contents.map((content) => ({ riskId: id, content, dueAt, status: 'OPEN' })),
      });
    }

    await this.prisma.riskItem.update({
      where: { id },
      data: {
        status: conclusion,
        dispositionSeverity: row.color,
        reopenedAt: null,
        processingById: null,
        processingStartedAt: null,
      },
    });
    await this.prisma.riskAction.create({
      data: { riskId: id, actorId: actor.id, conclusion, reason },
    });
    if (row.caseId) {
      await this.audit.append({
        caseId: row.caseId,
        actorId: actor.id,
        action: 'RISK_DISPOSITION',
        detail: { riskId: id, conclusion, reason },
      });
    }
    return this.open(actor, id);
  }

  async expireSupplements(actor: DemoActor, id: string) {
    this.assertRadarReader(actor);
    if (!riskSampleEnabled()) throw new ForbiddenException('当前环境不能修改补件截止日');
    const row = await this.prisma.riskItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('风险不存在');
    const dueAt = addUtcDays(new Date(), -1);
    await this.prisma.supplementTask.updateMany({
      where: { riskId: id, status: { not: 'ACCEPTED' } },
      data: { dueAt },
    });
    return { ok: true, dueAt };
  }

  async uploadSupplement(
    actor: DemoActor,
    taskId: string,
    file: { originalname?: string; size?: number; buffer?: Buffer; mimetype?: string },
    fileName?: string,
  ) {
    const task = await this.prisma.supplementTask.findUnique({
      where: { id: taskId },
      include: { risk: { select: { id: true, caseId: true, type: true } } },
    });
    if (!task) throw new NotFoundException('补件任务不存在');
    await this.assertCanUpload(actor, task.risk.caseId);
    if (task.status === 'ACCEPTED') throw new BadRequestException('这份补件已经复核通过');
    const name = String(fileName || file.originalname || '').trim();
    const size = Number(file.size || file.buffer?.length || 0);
    if (!name || !file.buffer?.length) throw new BadRequestException('请上传补件文件');
    if (size > UPLOAD_MAX) throw new BadRequestException('补件文件不能超过 15MB');
    const safe = name.split(/[/\\]/).pop()?.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_') || 'file';
    const storageKey = join('supplements', taskId, safe);
    const abs = join(process.cwd(), 'uploads', storageKey);
    await mkdir(join(process.cwd(), 'uploads', 'supplements', taskId), { recursive: true });
    await writeFile(abs, file.buffer);
    const saved = await this.prisma.supplementTask.update({
      where: { id: taskId },
      data: {
        status: 'SUBMITTED',
        fileName: name,
        fileJson: JSON.stringify({ storageKey, mime: file.mimetype || '', size }),
        uploadedById: actor.id,
        uploadedAt: new Date(),
      },
    });
    return presentTask(saved);
  }

  async acceptSupplement(actor: DemoActor, taskId: string) {
    this.assertRadarReader(actor);
    const task = await this.prisma.supplementTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('补件任务不存在');
    if (task.status !== 'SUBMITTED') throw new BadRequestException('补件上传后才能复核');
    const saved = await this.prisma.supplementTask.update({
      where: { id: taskId },
      data: { status: 'ACCEPTED' },
    });
    return presentTask(saved);
  }

  async rescreen(actor: DemoActor) {
    this.assertRadarReader(actor);
    const customers = await this.prisma.customer.findMany({
      include: {
        parties: { orderBy: { id: 'desc' }, include: { hits: true } },
      },
    });
    const suppliers = await this.prisma.supplier.findMany({
      include: {
        parties: { orderBy: { id: 'desc' }, include: { hits: true } },
      },
    });
    let freshCount = 0;
    let changedCount = 0;
    for (const customer of customers) {
      const counts = await this.applyRescreen(customer.name, customer.parties, 'N3');
      freshCount += counts.fresh;
      changedCount += counts.changed;
    }
    for (const supplier of suppliers) {
      const counts = await this.applyRescreen(supplier.name, supplier.parties, 'N5');
      freshCount += counts.fresh;
      changedCount += counts.changed;
    }
    await this.recalculate();
    const list = await this.presentList(actor);
    return { freshCount, changedCount, ...list };
  }

  async generateSamples(actor: DemoActor) {
    this.assertRadarReader(actor);
    if (!riskSampleEnabled()) throw new ForbiddenException('当前环境不能生成示例风险');
    const sales = await this.prisma.user.findFirst({ where: { role: UserRole.SALES }, orderBy: { createdAt: 'asc' } });
    if (!sales) throw new BadRequestException('请先建立业务、风控、主管三个演示用户');
    await generateSampleData(this.prisma, sales.id);
    await this.recalculate();
    return this.presentList(actor);
  }

  async clearSamples(actor: DemoActor) {
    this.assertRadarReader(actor);
    if (!riskSampleEnabled()) throw new ForbiddenException('当前环境不能清除示例');
    await clearSampleData(this.prisma);
    return { ok: true };
  }

  /**
   * 打开雷达或点刷新时重算。按指纹更新；规则消失的待处置改为系统关闭。
   * 有条件放行、已驳回、已解决：规则颜色没变或变轻时保持。
   * 规则颜色比处置当时更严重时重新打开，清掉处理中和已看过，未完成的补件保留。
   * 补件逾期只把黄色展示成橙色，不算处置后升级，也不会自动变红。不改闸门。
   */
  async recalculate(now = new Date()) {
    const findings = await this.collectFindings(now);
    const storedRows = await this.prisma.riskItem.findMany();
    const openTasks = await this.prisma.supplementTask.findMany({
      where: { status: 'OPEN' },
      include: { risk: { select: { fingerprint: true } } },
    });
    const overdue = new Set<string>();
    for (const task of openTasks) {
      if (utcDaysPast(now, task.dueAt) > 0) overdue.add(task.risk.fingerprint);
    }
    const plan = syncRiskState({
      stored: storedRows.map(toStored),
      findings,
      now,
      overdueFingerprints: overdue,
    });
    for (const row of plan) {
      if (row.op === 'unchanged') continue;
      const data = {
        type: row.type,
        color: row.color,
        ruleColor: row.ruleColor,
        status: row.status,
        title: row.title,
        subjectLabel: row.subjectLabel,
        caseId: row.caseId || null,
        batchId: row.batchId || null,
        customerId: row.customerId || null,
        supplierId: row.supplierId || null,
        linesJson: JSON.stringify(row.lines),
        firstSeenAt: new Date(row.firstSeenAt),
        lastHitAt: new Date(row.lastHitAt),
        escalatedAt: row.escalatedAt ? new Date(row.escalatedAt) : null,
        dispositionSeverity: row.dispositionSeverity,
        reopenedAt: row.reopenedAt ? new Date(row.reopenedAt) : null,
        isSample: row.isSample,
        preserveOnRecalc: row.preserveOnRecalc,
      };
      if (row.op === 'create') {
        await this.prisma.riskItem.create({ data: { ...data, fingerprint: row.fingerprint } });
        continue;
      }
      if (!row.id) continue;
      await this.prisma.riskItem.update({
        where: { id: row.id },
        data: row.reopened
          ? { ...data, processingById: null, processingStartedAt: null }
          : data,
      });
      if (!row.reopened) continue;
      await this.prisma.riskView.deleteMany({ where: { riskId: row.id } });
      const upgrade = row.lines.find((line) => line.code === SEVERITY_REOPEN_CODE);
      await this.prisma.riskAction.create({
        data: {
          riskId: row.id,
          conclusion: RiskConclusion.REOPENED,
          reason: upgrade?.text || '处置后风险升级',
        },
      });
    }
  }

  private async collectFindings(now: Date): Promise<RiskFinding[]> {
    const findings: RiskFinding[] = [];
    findings.push(...(await this.sanctionFindings()));
    findings.push(...(await this.occupancyFindings()));
    const batches = await this.prisma.shipmentBatch.findMany({
      include: {
        case: { include: { contract: true } },
        nodes: true,
        settlement: true,
        shipment: true,
      },
    });
    const evidences = await this.prisma.evidence.findMany({
      where: { batchId: { not: null }, nodeCode: 'N7' },
    });
    const kindsByBatch = new Map<string, string[]>();
    for (const evidence of evidences) {
      if (!evidence.batchId || !hasStorageKey(evidence.payload)) continue;
      const list = kindsByBatch.get(evidence.batchId) || [];
      list.push(evidence.kind);
      kindsByBatch.set(evidence.batchId, list);
    }
    for (const batch of batches) {
      const contract = batch.case.contract;
      if (!contract) continue;
      const n6 = batch.nodes.find((node) => node.code === 'N6');
      const n7 = batch.nodes.find((node) => node.code === 'N7');
      const amountFen = batch.amountFen != null ? batch.amountFen : contract.amountFen || batch.case.amountFen;
      const due = receivableDueDate({
        arrivalDate: batch.etaDate,
        n6PassedAt: n6?.status === 'PASSED' ? n6.completedAt : null,
        daysAfterArrival: contract.ttDaysAfterShipment,
      });
      const overdue = overdueFinding({
        batchId: batch.id,
        caseId: batch.caseId,
        caseNo: batch.case.caseNo,
        batchNo: batch.batchNo,
        ttTiming: contract.ttTiming,
        dueDate: due,
        today: now,
        collected: batchCollected(batch.settlement, amountFen || 0),
        daysAfterArrival: contract.ttDaysAfterShipment,
        usedN6Fallback: !batch.etaDate,
      });
      if (overdue) findings.push(overdue);
      const transport = effectiveN6Incoterms({
        contract,
        shipment: batch.shipment,
      } as unknown as CaseSnapshot);
      const missing = docMissingFinding({
        batchId: batch.id,
        caseId: batch.caseId,
        caseNo: batch.case.caseNo,
        n7Passed: n7?.status === 'PASSED',
        originRequired: n7OriginCertRequired(transport),
        presentKinds: kindsByBatch.get(batch.id) || [],
      });
      if (missing) findings.push(missing);
    }
    return findings;
  }

  private async sanctionFindings() {
    const hits = await this.prisma.screeningHit.findMany({
      include: {
        party: {
          include: {
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        },
      },
    });
    return sanctionFindings(
      hits.map((hit) => {
        const supplierSide = hit.party.role === 'SUPPLIER';
        return {
          customerId: supplierSide ? null : hit.party.customerId,
          supplierId: supplierSide ? hit.party.supplierId : null,
          caseId: hit.caseId,
          subjectName: hit.party.name,
          subjectLabel: supplierSide ? hit.party.supplier?.name || hit.party.name : hit.party.customer?.name || hit.party.name,
          listCode: hit.listCode,
          listedName: hit.listedName,
          matchedName: hit.matchedName,
          confidence: hit.confidence,
          disposition: hit.disposition,
        };
      }),
    );
  }

  private async occupancyFindings() {
    const customers = await this.prisma.customer.findMany({
      include: {
        parties: {
          where: { role: 'BUYER' },
          include: {
            case: {
              include: {
                contract: true,
                nodes: true,
                sinosurePolicies: { orderBy: { createdAt: 'asc' } },
                shipmentBatches: { include: { settlement: true, nodes: true, shipment: true } },
              },
            },
          },
        },
      },
    });
    const findings: RiskFinding[] = [];
    for (const customer of customers) {
      const seen = new Set<string>();
      const cases: Array<(typeof customer.parties)[number]['case']> = [];
      for (const party of customer.parties) {
        if (seen.has(party.caseId) || !party.case.contract) continue;
        seen.add(party.caseId);
        cases.push(party.case);
      }
      if (!cases.length) continue;
      const policies = cases
        .flatMap((row) => row.sinosurePolicies)
        .filter((policy) => isUsd(policy.currency))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      const quota = quotaFromLimits(policies.map((policy) => policy.insuredLimitFen));
      const exposure = evaluateBuyerOccupancy(
        cases.map((row) => {
          const amountFen = row.contract?.amountFen ?? row.amountFen;
          const batches = row.shipmentBatches || [];
          const sole = batches.length === 1;
          const portions = batches.length
            ? contractOccupancyPortions({
                amountFen,
                batches: batches.map((batch) => ({
                  amountFen: batch.amountFen,
                  receivedFen: receivedFenForBatch(batch, { contractAmountFen: amountFen, sole }),
                  shipped: batchCountsAsShipped(batch),
                })),
              })
            : null;
          return {
            id: row.id,
            caseNo: row.caseNo,
            title: row.title,
            hasContract: true,
            amountFen,
            currency: row.contract?.currency || row.currency,
            receivedFen: portions?.receivedFen || 0,
            status: row.status,
            currentNode: row.currentNode,
            nodes: row.nodes.map((node) => ({ code: node.code, status: node.status })),
            ...(portions
              ? { batchSplit: true, openUnpaidFen: portions.openUnpaidFen, fulfilledUnpaidFen: portions.fulfilledUnpaidFen }
              : {}),
          };
        }),
        {
          insuredLimitFen: quota.effectiveFen,
          limitCurrency: 'USD',
          newAmountFen: 0,
          newCurrency: 'USD',
        },
      );
      const primary = [...cases].sort((a, b) => (b.contract?.amountFen || 0) - (a.contract?.amountFen || 0))[0];
      const found = occupancyFinding({
        customerId: customer.id,
        customerName: customer.name,
        caseId: primary?.id,
        caseNo: primary?.caseNo,
        occupancyFen: exposure.occupancyFen,
        effectiveLimitFen: quota.effectiveFen,
        additionalFen: quota.additionalFen,
        usd: exposure.currencyOk && isUsd(exposure.currency),
      });
      if (found) findings.push(found);
    }
    return findings;
  }

  private async applyRescreen(
    name: string,
    parties: Array<{ id: string; caseId: string; hits: Array<{ id: string; listCode: string; listedName: string; confidence: string; disposition: string }> }>,
    nodeCode: 'N3' | 'N5',
  ) {
    const matches = await this.screening.screenName(name);
    const existing = parties.flatMap((party) => party.hits);
    const diff = diffScreeningMatches(existing, matches);
    const host = parties[0];
    if (host) {
      for (const match of diff.fresh) {
        await this.prisma.screeningHit.create({
          data: {
            caseId: host.caseId,
            partyId: host.id,
            nodeCode,
            listCode: match.listCode,
            listedName: match.listedName,
            matchedName: match.matchedName,
            confidence: match.confidence,
            riskLevel: riskFromScore(scoreOf(match.confidence as 'HIGH' | 'MEDIUM' | 'LOW', match.listCode)),
            disposition: 'OPEN',
            score: scoreOf(match.confidence as 'HIGH' | 'MEDIUM' | 'LOW', match.listCode),
            rawJson: JSON.stringify({ source: 'risk-radar-rescreen', ...match }),
          },
        });
      }
    }
    for (const change of diff.changed) {
      const confidence = change.match.confidence as 'HIGH' | 'MEDIUM' | 'LOW';
      await this.prisma.screeningHit.update({
        where: { id: change.hitId },
        data: {
          confidence,
          listedName: change.match.listedName,
          matchedName: change.match.matchedName,
          score: scoreOf(confidence, change.match.listCode),
          riskLevel: riskFromScore(scoreOf(confidence, change.match.listCode)),
        },
      });
    }
    return { fresh: host ? diff.fresh.length : 0, changed: diff.changed.length };
  }

  private async presentList(actor: DemoActor) {
    const rows = await this.prisma.riskItem.findMany({
      where: { status: { not: RiskStatus.SYSTEM_CLOSED } },
      include: {
        processingBy: { select: { id: true, name: true } },
        views: { where: { userId: actor.id }, select: { id: true } },
        case: { select: { caseNo: true } },
      },
    });
    const cards = rows
      .map((row) => this.toCard(row, row.views.length > 0))
      .sort((a, b) =>
        compareRiskQueue(
          {
            color: a.color,
            escalatedAt: a.escalatedAt ? new Date(a.escalatedAt).toISOString() : null,
            reopenedAt: a.reopenedAt ? new Date(a.reopenedAt).toISOString() : null,
            firstSeenAt: new Date(a.firstSeenAt).toISOString(),
          },
          {
            color: b.color,
            escalatedAt: b.escalatedAt ? new Date(b.escalatedAt).toISOString() : null,
            reopenedAt: b.reopenedAt ? new Date(b.reopenedAt).toISOString() : null,
            firstSeenAt: new Date(b.firstSeenAt).toISOString(),
          },
        ),
      );
    const active = cards.filter((row) => row.status === RiskStatus.PENDING || row.status === RiskStatus.CONDITIONAL_RELEASE);
    const settled = cards.filter((row) => row.status === RiskStatus.RESOLVED || row.status === RiskStatus.REJECTED);
    const counts = {
      SANCTION: active.filter((row) => row.type === RiskType.SANCTION).length,
      SINOSURE_OCCUPANCY: active.filter((row) => row.type === RiskType.SINOSURE_OCCUPANCY).length,
      OVERDUE_RECEIVABLE: active.filter((row) => row.type === RiskType.OVERDUE_RECEIVABLE).length,
      DOC_MISSING: active.filter((row) => row.type === RiskType.DOC_MISSING).length,
    };
    return { sampleEnabled: riskSampleEnabled(), counts, items: active, settled };
  }

  private toCard(
    row: {
      id: string;
      type: string;
      color: string;
      status: string;
      title: string;
      subjectLabel: string;
      caseId: string | null;
      firstSeenAt: Date;
      lastHitAt: Date;
      escalatedAt: Date | null;
      reopenedAt: Date | null;
      isSample: boolean;
      processingBy?: { id: string; name: string } | null;
      case?: { caseNo: string } | null;
    },
    seen: boolean,
  ) {
    return {
      id: row.id,
      type: row.type,
      typeLabel: RiskTypeLabel[row.type] || row.type,
      color: row.color,
      colorLabel: RiskColorLabel[row.color] || row.color,
      status: row.status,
      statusLabel: RiskStatusLabel[row.status] || row.status,
      title: row.title,
      subjectLabel: row.case?.caseNo || row.subjectLabel,
      caseId: row.caseId,
      firstSeenAt: row.firstSeenAt,
      lastHitAt: row.lastHitAt,
      escalatedAt: row.escalatedAt,
      escalated: !!row.escalatedAt,
      reopenedAt: row.reopenedAt,
      reopened: !!row.reopenedAt,
      seen,
      isSample: row.isSample,
      processingBy: row.processingBy ? { id: row.processingBy.id, name: row.processingBy.name } : null,
    };
  }

  /** 案件没有业务负责人字段，按创建人（审计 CASE_CREATED）判断是不是自己的案件。 */
  private async assertCanUpload(actor: DemoActor, caseId: string | null) {
    const role = normalizeDemoRole(actor.role);
    if (role === UserRole.RISK || role === UserRole.MANAGER) return;
    if (role !== UserRole.SALES) throw new ForbiddenException('请先选择演示角色');
    if (!caseId) throw new ForbiddenException('这不是你的案件');
    const created = await this.prisma.auditLog.findFirst({
      where: { caseId, action: 'CASE_CREATED', actorId: actor.id },
    });
    if (!created) throw new ForbiddenException('只能给自己的案件上传补件');
  }

  private assertRadarReader(actor: DemoActor) {
    const role = normalizeDemoRole(actor.role);
    if (role === UserRole.RISK || role === UserRole.MANAGER) return;
    throw new ForbiddenException('业务岗不能查看制裁明细，请从「我的风险和补件」进入');
  }
}

function toStored(row: {
  id: string;
  fingerprint: string;
  type: string;
  color: string;
  ruleColor: string;
  status: string;
  title: string;
  subjectLabel: string;
  caseId: string | null;
  batchId: string | null;
  customerId: string | null;
  supplierId: string | null;
  linesJson: string;
  firstSeenAt: Date;
  lastHitAt: Date;
  escalatedAt: Date | null;
  dispositionSeverity: string | null;
  reopenedAt: Date | null;
  isSample: boolean;
  preserveOnRecalc: boolean;
}): StoredRisk {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    type: row.type,
    color: row.color,
    ruleColor: row.ruleColor,
    status: row.status,
    title: row.title,
    subjectLabel: row.subjectLabel,
    caseId: row.caseId,
    batchId: row.batchId,
    customerId: row.customerId,
    supplierId: row.supplierId,
    lines: parseLines(row.linesJson),
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastHitAt: row.lastHitAt.toISOString(),
    escalatedAt: row.escalatedAt ? row.escalatedAt.toISOString() : null,
    dispositionSeverity: row.dispositionSeverity,
    reopenedAt: row.reopenedAt ? row.reopenedAt.toISOString() : null,
    isSample: row.isSample,
    preserveOnRecalc: row.preserveOnRecalc,
  };
}

function parseLines(raw: string): RiskLine[] {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((line) => line && typeof line.text === 'string')
      .map((line) => ({
        code: String(line.code || ''),
        text: String(line.text),
        supplement: line.supplement ? String(line.supplement) : undefined,
      }));
  } catch {
    return [];
  }
}

function conclusionLabelOf(conclusion: string): string {
  if (conclusion === RiskConclusion.REOPENED) return '重新打开';
  return RiskStatusLabel[conclusion] || conclusion;
}

function presentTask(task: {
  id: string;
  content: string;
  dueAt: Date;
  status: string;
  fileName: string | null;
  uploadedAt: Date | null;
}) {
  const statusLabel = task.status === 'ACCEPTED' ? '已复核' : task.status === 'SUBMITTED' ? '待复核' : '待补';
  return {
    id: task.id,
    content: task.content,
    dueAt: task.dueAt,
    status: task.status,
    statusLabel,
    fileName: task.fileName,
    uploadedAt: task.uploadedAt,
  };
}

function workbenchTabOf(type: string): 'sanctions' | 'occupancy' | null {
  if (type === RiskType.SANCTION) return 'sanctions';
  if (type === RiskType.SINOSURE_OCCUPANCY) return 'occupancy';
  return null;
}

function hasStorageKey(payload: string | null): boolean {
  try {
    const value = JSON.parse(payload || '{}');
    return !!String(value?.storageKey || '').trim();
  } catch {
    return false;
  }
}
