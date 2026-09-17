import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScreeningService } from '../screening/screening.service';
import { GateService } from '../gates/gate.service';
import {
  CUSTOMER_PARTY_ROLES,
  CaseStatus,
  ChangeFieldLabel,
  ChangeStatus,
  Decision,
  Disposition,
  EportStatus,
  EvidenceKind,
  NODE_CATALOG,
  NodeStatus,
  PartyRole,
  PartyRoleLabel,
  QuoteStatus,
  RiskLevel,
  VersionStatus,
} from '../common/constants';
import { isChangeField, isSensitiveChange, nextNode } from '../gates/gate.engine';
import {
  AckChangeDto,
  CreateCaseDto,
  CreateChangeDto,
  SaveContractDto,
  SaveCustomsDto,
  SaveDocumentDto,
  SaveFixDto,
  SavePlanDto,
  SaveQuoteDto,
  SaveSettlementDto,
  SaveShipmentDto,
  SaveSinosureDto,
  UpsertPartyDto,
} from './dto';
import { GateResult } from '../common/types';
import { CustomersService } from '../customers/customers.service';
import { derivePaymentDueAt } from '../customers/remittance';
import { SuppliersService } from '../suppliers/suppliers.service';
import { buildInstallmentRecords, presentPlanPayment } from '../suppliers/payment-schedule';

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly screening: ScreeningService,
    private readonly gates: GateService,
    private readonly customers: CustomersService,
    private readonly suppliers: SuppliersService,
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
        kycReports: { orderBy: { createdAt: 'desc' }, take: 12 },
        contract: true,
        shipment: { include: { approver: true } },
        documents: true,
        mismatchFixes: true,
        settlement: true,
        gateChecks: { orderBy: { createdAt: 'desc' }, take: 12 },
        quotes: { orderBy: { version: 'desc' } },
        changeOrders: { include: { diffs: true }, orderBy: { createdAt: 'asc' } },
        contractVersions: { orderBy: { version: 'desc' } },
        procurementPlan: { include: { installments: { orderBy: { seq: 'asc' } } } },
        customs: true,
        evidences: { orderBy: { createdAt: 'asc' } },
        sinosurePolicies: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('案件不存在');
    const planPayment = c.procurementPlan ? presentPlanPayment(c.procurementPlan) : null;
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
      quotes: c.quotes.map((q) => ({ ...q, snapshot: safeJson(q.snapshotJson) })),
      contractVersions: c.contractVersions.map((v) => ({ ...v, snapshot: safeJson(v.snapshotJson) })),
      customs: c.customs
        ? { ...c.customs, declareElements: safeJson(c.customs.declareElementsJson) }
        : null,
      evidences: c.evidences.map((e) => ({ ...e, payload: e.payload ? safeJson(e.payload) : null })),
      procurementPlan: c.procurementPlan
        ? {
            ...c.procurementPlan,
            paymentMode: planPayment?.paymentMode ?? c.procurementPlan.paymentMode,
            paymentModeLabel: planPayment?.paymentModeLabel,
            installments: planPayment?.installments ?? [],
            scheduleWording: planPayment?.wording,
            unpaidFen: planPayment?.unpaidFen,
          }
        : null,
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
            status: NodeStatus.NOT_STARTED,
            isStub: false,
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
    let supplierId: string | undefined;
    if (dto.role === PartyRole.SUPPLIER) {
      const supplier = await this.suppliers.findOrCreateFromParty(dto);
      supplierId = supplier?.id;
    }
    const data = {
      ...dto,
      ...(supplierId ? { supplierId } : {}),
    };
    const party = existing
      ? await this.prisma.party.update({ where: { id: existing.id }, data })
      : await this.prisma.party.create({ data: { caseId, ...data } });
    const nodeCode = dto.role === PartyRole.SUPPLIER ? 'N5' : 'N1';
    await this.touchNode(caseId, nodeCode, NodeStatus.IN_PROGRESS);
    if (dto.role !== PartyRole.SUPPLIER) {
      await this.enrollBuyerIfReachedN3(caseId, actorId);
    }
    await this.audit.append({
      caseId,
      actorId,
      action: 'PARTY_UPSERT',
      nodeCode,
      detail: { role: dto.role, name: dto.name },
    });
    return party;
  }

  async screenKyc(caseId: string, actorId?: string) {
    return this.screenParties(caseId, 'N1', [...CUSTOMER_PARTY_ROLES], actorId);
  }

  async screenSupplier(caseId: string, actorId?: string) {
    return this.screenParties(caseId, 'N5', [PartyRole.SUPPLIER], actorId);
  }

  async saveContract(caseId: string, dto: SaveContractDto, actorId?: string) {
    await this.ensureCase(caseId);
    const { deliveryDate, paymentDueAt, ...rest } = dto;
    const parsedDelivery = parseDate(deliveryDate);
    const data = {
      ...rest,
      deliveryDate: parsedDelivery,
      paymentDueAt: parseDate(paymentDueAt) ?? derivePaymentDueAt(parsedDelivery, dto.paymentTerms),
    };
    const row = await this.prisma.contract.upsert({
      where: { caseId },
      create: { caseId, ...data },
      update: data,
    });
    if (dto.amountFen != null || dto.currency) {
      await this.prisma.tradeCase.update({
        where: { id: caseId },
        data: {
          ...(dto.amountFen != null ? { amountFen: dto.amountFen } : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
        },
      });
    }
    await this.snapshotContract(caseId, null);
    await this.touchNode(caseId, 'N3', NodeStatus.IN_PROGRESS);
    await this.enrollBuyerIfReachedN3(caseId, actorId);
    await this.audit.append({
      caseId,
      actorId,
      action: 'CONTRACT_SAVED',
      nodeCode: 'N3',
      detail: dto,
    });
    return row;
  }

  async saveSinosure(caseId: string, nodeCode: string, dto: SaveSinosureDto, actorId?: string) {
    await this.ensureCase(caseId);
    const code = (nodeCode || 'N3').toUpperCase();
    if (code !== 'N3' && code !== 'N4') {
      throw new BadRequestException('中信保登记仅适用于合同确认（N3）或变更管理（N4）');
    }

    let changeOrderId = dto.changeOrderId ?? null;
    if (code === 'N4' && !changeOrderId) {
      const latestChange = await this.prisma.changeOrder.findFirst({
        where: { caseId, status: { not: ChangeStatus.SUPERSEDED } },
        orderBy: { createdAt: 'desc' },
      });
      changeOrderId = latestChange?.id ?? null;
    }

    let evidenceRef = dto.evidenceRef?.trim() || '';
    let fileName = dto.fileName?.trim() || '';
    let insuredLimitFen = dto.insuredLimitFen;
    let currency = dto.currency || 'USD';
    let confirmedExisting = !!dto.confirmedExisting;
    let sourceId: string | null = null;

    if (confirmedExisting) {
      const prior = await this.prisma.sinosurePolicy.findFirst({
        where: { caseId, nodeCode: 'N3' },
        orderBy: { createdAt: 'desc' },
      });
      if (!prior) throw new BadRequestException('尚无合同环节的中信保记录，请先上传保单');
      sourceId = prior.id;
      evidenceRef = evidenceRef || prior.evidenceRef || '';
      fileName = fileName || prior.fileName || '';
      insuredLimitFen = insuredLimitFen ?? prior.insuredLimitFen;
      currency = dto.currency || prior.currency;
    }

    if (!insuredLimitFen || insuredLimitFen <= 0) {
      throw new BadRequestException('请填写中信保投保限额');
    }
    if (!evidenceRef && !fileName) {
      evidenceRef = `SINOSURE-${Date.now()}`;
      fileName = fileName || '中信保限额批注-模拟.pdf';
    }

    const kind = confirmedExisting ? EvidenceKind.SINOSURE_CONFIRM : EvidenceKind.SINOSURE_POLICY;
    const ev = await this.addEvidence(caseId, code, kind, {
      ref: evidenceRef || fileName,
      note: confirmedExisting ? '确认沿用当前中信保保单' : '中信保保单/限额批注',
      payload: {
        fileName,
        insuredLimitFen,
        currency,
        confirmedExisting,
        changeOrderId,
        sourcePolicyId: sourceId,
      },
    });

    const row = await this.prisma.sinosurePolicy.create({
      data: {
        caseId,
        nodeCode: code,
        changeOrderId,
        evidenceId: ev.id,
        evidenceRef: evidenceRef || ev.id,
        fileName: fileName || null,
        insuredLimitFen,
        currency,
        confirmedExisting,
      },
    });
    await this.touchNode(caseId, code, NodeStatus.IN_PROGRESS);
    if (code === 'N3' || code === 'N4') {
      await this.enrollBuyerIfReachedN3(caseId, actorId);
    }
    await this.audit.append({
      caseId,
      actorId,
      action: confirmedExisting ? 'SINOSURE_CONFIRMED' : 'SINOSURE_SAVED',
      nodeCode: code,
      detail: {
        policyId: row.id,
        evidenceId: ev.id,
        evidenceRef: row.evidenceRef,
        insuredLimitFen,
        currency,
        changeOrderId,
        confirmedExisting,
      },
    });
    return row;
  }

  async saveQuote(caseId: string, dto: SaveQuoteDto, actorId?: string) {
    await this.ensureCase(caseId);
    const last = await this.prisma.quote.findFirst({
      where: { caseId },
      orderBy: { version: 'desc' },
    });
    const version = (last?.version ?? 0) + 1;
    if (last?.status === QuoteStatus.ACTIVE) {
      await this.prisma.quote.update({
        where: { id: last.id },
        data: { status: QuoteStatus.SUPERSEDED },
      });
    }
    const amountFen =
      dto.amountFen ??
      (dto.unitPriceFen && dto.quantity ? dto.unitPriceFen * dto.quantity : dto.unitPriceFen ?? null);
    const snapshot = {
      version,
      priceBasis: dto.priceBasis,
      includedItems: dto.includedItems ?? null,
      excludedItems: dto.excludedItems ?? null,
      validityUntil: dto.validityUntil ?? null,
      freightBearer: dto.freightBearer ?? null,
      taxBearer: dto.taxBearer ?? null,
      unitPriceFen: dto.unitPriceFen ?? null,
      quantity: dto.quantity ?? null,
      amountFen,
      notes: dto.notes ?? null,
      abnormalPriceNote: dto.abnormalPriceNote ?? null,
    };
    const row = await this.prisma.quote.create({
      data: {
        caseId,
        version,
        status: QuoteStatus.ACTIVE,
        priceBasis: dto.priceBasis,
        includedItems: dto.includedItems,
        excludedItems: dto.excludedItems,
        validityUntil: parseDate(dto.validityUntil),
        freightBearer: dto.freightBearer,
        taxBearer: dto.taxBearer,
        unitPriceFen: dto.unitPriceFen,
        quantity: dto.quantity,
        amountFen,
        currency: dto.currency ?? 'USD',
        notes: dto.notes,
        abnormalPriceNote: dto.abnormalPriceNote,
        snapshotJson: JSON.stringify(snapshot),
      },
    });
    const evidence = await this.addEvidence(caseId, 'N2', EvidenceKind.QUOTE_SNAPSHOT, {
      ref: `Q-v${version}`,
      note: '报价版本字段快照',
      payload: snapshot,
    });
    await this.touchNode(caseId, 'N2', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'QUOTE_VERSION_SAVED',
      nodeCode: 'N2',
      detail: { version, superseded: last?.version ?? null, snapshot, evidenceId: evidence.id },
    });
    return { ...row, snapshot, evidenceId: evidence.id };
  }

  async createChange(caseId: string, dto: CreateChangeDto, actorId?: string) {
    await this.ensureCase(caseId);
    if (!dto.diffs?.length) throw new BadRequestException('变更单须包含至少一个字段 diff');
    for (const d of dto.diffs) {
      if (!isChangeField(d.field)) {
        throw new BadRequestException(`不支持的变更字段：${d.field}`);
      }
    }
    const count = await this.prisma.changeOrder.count({ where: { caseId } });
    const version = count + 1;
    const changeNo = `CO-${String(version).padStart(3, '0')}`;
    const current = await this.currentFieldMap(caseId);
    const diffs = dto.diffs.map((d) => ({
      field: d.field,
      fieldLabel: ChangeFieldLabel[d.field] || d.field,
      oldValue: d.oldValue ?? current[d.field] ?? '',
      newValue: d.newValue,
    }));
    const isSensitive = isSensitiveChange(diffs.map((d) => d.field));
    const row = await this.prisma.changeOrder.create({
      data: {
        caseId,
        changeNo,
        version,
        status: ChangeStatus.PENDING_ACK,
        reason: dto.reason,
        isSensitive,
        diffs: { create: diffs },
      },
      include: { diffs: true },
    });
    await this.touchNode(caseId, 'N4', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'CHANGE_ORDER_CREATED',
      nodeCode: 'N4',
      detail: { changeId: row.id, changeNo, diffs, isSensitive },
    });
    return row;
  }

  async ackChange(caseId: string, changeId: string, dto: AckChangeDto, actorId?: string) {
    await this.ensureCase(caseId);
    const co = await this.prisma.changeOrder.findFirst({
      where: { id: changeId, caseId },
      include: { diffs: true },
    });
    if (!co) throw new NotFoundException('变更单不存在');
    if (co.status === ChangeStatus.SUPERSEDED || co.status === ChangeStatus.APPLIED) {
      throw new BadRequestException('已生效或已废止的变更单不可再确认');
    }
    const type = (dto.type || '').toUpperCase();
    if (type === 'CUSTOMER') {
      const ev = await this.addEvidence(caseId, 'N4', EvidenceKind.CUSTOMER_ACK, {
        ref: dto.ref || co.changeNo,
        note: dto.note || '客户确认变更',
        payload: { changeId, changeNo: co.changeNo, diffs: co.diffs },
      });
      const row = await this.prisma.changeOrder.update({
        where: { id: changeId },
        data: {
          customerAck: true,
          customerAckRef: dto.ref || ev.id,
          customerAckEvidenceId: ev.id,
          customerAckedAt: new Date(),
        },
        include: { diffs: true },
      });
      await this.audit.append({
        caseId,
        actorId,
        action: 'CHANGE_CUSTOMER_ACK',
        nodeCode: 'N4',
        detail: { changeId, changeNo: co.changeNo, evidenceId: ev.id },
      });
      return row;
    }
    if (type === 'INTERNAL') {
      const ev = await this.addEvidence(caseId, 'N4', EvidenceKind.INTERNAL_ACK, {
        ref: dto.ref || co.changeNo,
        note: dto.note || '内部确认变更',
        payload: { changeId, changeNo: co.changeNo },
      });
      const nextStatus =
        co.isSensitive && !co.approved ? ChangeStatus.PENDING_APPROVAL : ChangeStatus.PENDING_ACK;
      const row = await this.prisma.changeOrder.update({
        where: { id: changeId },
        data: {
          internalAck: true,
          internalAckEvidenceId: ev.id,
          internalAckedAt: new Date(),
          status: nextStatus,
        },
        include: { diffs: true },
      });
      await this.audit.append({
        caseId,
        actorId,
        action: 'CHANGE_INTERNAL_ACK',
        nodeCode: 'N4',
        detail: { changeId, changeNo: co.changeNo, evidenceId: ev.id },
      });
      return row;
    }
    if (type === 'APPROVAL') {
      if (!co.isSensitive) throw new BadRequestException('非敏感变更无需额外审批');
      const ev = await this.addEvidence(caseId, 'N4', EvidenceKind.CHANGE_APPROVAL, {
        ref: dto.ref || co.changeNo,
        note: dto.note || '敏感变更审批',
        payload: { changeId, changeNo: co.changeNo, diffs: co.diffs },
      });
      const row = await this.prisma.changeOrder.update({
        where: { id: changeId },
        data: {
          approved: true,
          approvalEvidenceId: ev.id,
          approvedAt: new Date(),
          status: ChangeStatus.PENDING_ACK,
        },
        include: { diffs: true },
      });
      await this.audit.append({
        caseId,
        actorId,
        action: 'CHANGE_APPROVED',
        nodeCode: 'N4',
        detail: { changeId, changeNo: co.changeNo, evidenceId: ev.id },
      });
      return row;
    }
    throw new BadRequestException('确认类型须为 CUSTOMER / INTERNAL / APPROVAL');
  }

  async applyChange(caseId: string, changeId: string, actorId?: string) {
    await this.ensureCase(caseId);
    const co = await this.prisma.changeOrder.findFirst({
      where: { id: changeId, caseId },
      include: { diffs: true },
    });
    if (!co) throw new NotFoundException('变更单不存在');
    if (!co.customerAck || !co.customerAckEvidenceId || !co.internalAck || !co.internalAckEvidenceId) {
      throw new BadRequestException('须完成客户确认与内部确认后才能生效');
    }
    if (co.isSensitive && (!co.approved || !co.approvalEvidenceId)) {
      throw new BadRequestException('敏感变更须审批后才能生效');
    }
    const contract = await this.prisma.contract.findUnique({ where: { caseId } });
    const patch: Record<string, unknown> = {};
    let partyChanged = false;
    for (const d of co.diffs) {
      if (d.field === 'deliveryDate') patch.deliveryDate = parseDate(d.newValue);
      if (d.field === 'quantity') {
        patch.quantity = Number(d.newValue);
        const quote = await this.prisma.quote.findFirst({
          where: { caseId, status: QuoteStatus.ACTIVE },
          orderBy: { version: 'desc' },
        });
        if (quote?.unitPriceFen && Number.isFinite(Number(d.newValue))) {
          patch.amountFen = quote.unitPriceFen * Number(d.newValue);
        } else if (contract?.amountFen && Number(d.oldValue) > 0) {
          patch.amountFen = Math.round((contract.amountFen * Number(d.newValue)) / Number(d.oldValue));
        }
      }
      if (d.field === 'paymentTerms') patch.paymentTerms = d.newValue;
      if (d.field === 'consigneeName') {
        patch.consigneeName = d.newValue;
        await this.upsertParty(caseId, { role: PartyRole.CONSIGNEE, name: d.newValue, isSameAsBuyer: false }, actorId);
        partyChanged = true;
      }
      if (d.field === 'buyerName') {
        patch.buyerName = d.newValue;
        await this.upsertParty(caseId, { role: PartyRole.BUYER, name: d.newValue }, actorId);
        partyChanged = true;
      }
      if (d.field === 'payerName') {
        await this.upsertParty(caseId, { role: PartyRole.PAYER, name: d.newValue, isSameAsBuyer: false }, actorId);
        partyChanged = true;
      }
    }
    if (contract && Object.keys(patch).length) {
      await this.prisma.contract.update({ where: { caseId }, data: patch as any });
      if (typeof patch.amountFen === 'number') {
        await this.prisma.tradeCase.update({
          where: { id: caseId },
          data: { amountFen: patch.amountFen as number },
        });
      }
    }
    if (partyChanged) {
      await this.screenKyc(caseId, actorId);
    }
    await this.snapshotContract(caseId, co.id);
    const row = await this.prisma.changeOrder.update({
      where: { id: changeId },
      data: { status: ChangeStatus.APPLIED, appliedAt: new Date() },
      include: { diffs: true },
    });
    await this.audit.append({
      caseId,
      actorId,
      action: 'CHANGE_ORDER_APPLIED',
      nodeCode: 'N4',
      detail: {
        changeId,
        changeNo: co.changeNo,
        diffs: co.diffs,
        customerAckEvidenceId: co.customerAckEvidenceId,
        internalAckEvidenceId: co.internalAckEvidenceId,
        approvalEvidenceId: co.approvalEvidenceId,
        partyRescreened: partyChanged,
      },
    });
    return row;
  }

  async savePlan(caseId: string, dto: SavePlanDto, actorId?: string) {
    await this.ensureCase(caseId);
    const contract = await this.prisma.contract.findUnique({ where: { caseId } });
    if (dto.supplierName?.trim()) {
      await this.upsertParty(
        caseId,
        {
          role: PartyRole.SUPPLIER,
          name: dto.supplierName.trim(),
          nameEn: dto.supplierNameEn,
          country: dto.supplierCountry,
          address: dto.supplierAddress,
          registrationNo: dto.supplierRegistrationNo,
          isSameAsBuyer: false,
        },
        actorId,
      );
    }
    let consentId = undefined as string | undefined;
    if (dto.customerConsent && dto.customerConsentRef) {
      const ev = await this.addEvidence(caseId, 'N5', EvidenceKind.DELAY_CONSENT, {
        ref: dto.customerConsentRef,
        note: dto.delayReason || '客户同意采购到货延期',
        payload: { trigger: dto.delayTriggerCode, triggerRef: dto.delayTriggerRef },
      });
      consentId = ev.id;
    }
    let poEvidenceId = undefined as string | undefined;
    const poStub = dto.poEvidenceStub?.trim() || dto.poFileName?.trim();
    if (poStub || dto.poNo?.trim()) {
      if (poStub) {
        const ev = await this.addEvidence(caseId, 'N5', EvidenceKind.PROCUREMENT_PO, {
          ref: dto.poNo || poStub,
          note: poStub,
          payload: { poNo: dto.poNo, fileName: poStub },
        });
        poEvidenceId = ev.id;
      }
    }
    const existingPlan = await this.prisma.procurementPlan.findUnique({
      where: { caseId },
      include: { installments: { orderBy: { seq: 'asc' } } },
    });
    const amountFen = dto.amountFen ?? existingPlan?.amountFen ?? null;
    const schedule = buildInstallmentRecords(
      {
        paymentMode: dto.paymentMode,
        paymentConditionText: dto.paymentConditionText,
        amountFen,
        paidFen: dto.paidFen,
        paymentDueAt: parseDate(dto.paymentDueAt) ?? existingPlan?.paymentDueAt ?? null,
        paidAt: parseDate(dto.paidAt) ?? existingPlan?.paidAt ?? null,
        installments: dto.installments?.map((item) => ({
          ...item,
          dueAt: parseDate(item.dueAt),
          paidAt: parseDate(item.paidAt),
        })),
      },
      existingPlan,
    );
    const data = {
      poNo: dto.poNo || null,
      plannedArrival: parseDate(dto.plannedArrival || dto.plannedDelivery),
      contractDelivery: parseDate(dto.contractDelivery) || contract?.deliveryDate || null,
      poEvidenceStub: poStub || null,
      poEvidenceId: poEvidenceId || existingPlan?.poEvidenceId || null,
      delayRegistered: dto.delayRegistered ?? false,
      delayTriggerCode: dto.delayTriggerCode,
      delayTriggerRef: dto.delayTriggerRef,
      delayReason: dto.delayReason,
      customerConsent: dto.customerConsent ?? false,
      customerConsentEvidenceId: consentId || existingPlan?.customerConsentEvidenceId || null,
      actualArrival: parseDate(dto.actualArrival) ?? existingPlan?.actualArrival ?? null,
      amountFen,
      currency: dto.currency || existingPlan?.currency || 'CNY',
      paidFen: schedule.rollup.paidFen,
      paymentDueAt: schedule.rollup.paymentDueAt,
      paidAt: schedule.rollup.paidAt,
      paymentMode: schedule.paymentMode,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.procurementPlan.upsert({
        where: { caseId },
        create: { caseId, ...data },
        update: data,
      });
      await tx.procurementPaymentInstallment.deleteMany({ where: { planId: plan.id } });
      if (schedule.resolved.length) {
        await tx.procurementPaymentInstallment.createMany({
          data: schedule.resolved.map((item) => ({
            planId: plan.id,
            seq: item.seq,
            label: item.label,
            percentBps: item.percentBps,
            amountFen: item.amountFen,
            conditionText: item.conditionText,
            dueAt: parseDate(item.dueAt),
            paidFen: item.paidFen,
            paidAt: parseDate(item.paidAt),
          })),
        });
      }
      return tx.procurementPlan.findUniqueOrThrow({
        where: { id: plan.id },
        include: { installments: { orderBy: { seq: 'asc' } } },
      });
    });
    await this.touchNode(caseId, 'N5', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'PROCUREMENT_PLAN_SAVED',
      nodeCode: 'N5',
      detail: { ...dto, customerConsentEvidenceId: consentId, poEvidenceId, paymentMode: schedule.paymentMode },
    });
    const presented = presentPlanPayment(row);
    return {
      ...row,
      paymentModeLabel: presented.paymentModeLabel,
      installments: presented.installments,
      scheduleWording: presented.wording,
      unpaidFen: presented.unpaidFen,
    };
  }

  async saveCustoms(caseId: string, dto: SaveCustomsDto, actorId?: string) {
    await this.ensureCase(caseId);
    let originEvidenceId: string | undefined;
    if (dto.originEvidenceType && dto.originEvidenceRef) {
      const ev = await this.addEvidence(caseId, 'N8', EvidenceKind.ORIGIN_CERT, {
        ref: dto.originEvidenceRef,
        note: dto.originEvidenceType,
        payload: { originCountry: dto.originCountry },
      });
      originEvidenceId = ev.id;
    }
    const data = {
      hsCode: dto.hsCode,
      productName: dto.productName,
      declareElementsJson: JSON.stringify(dto.declareElements ?? {}),
      originCountry: dto.originCountry,
      originEvidenceType: dto.originEvidenceType,
      originEvidenceRef: dto.originEvidenceRef,
      originEvidenceId,
      unit: dto.unit,
      exportTaxName: dto.exportTaxName,
    };
    const row = await this.prisma.customsDeclaration.upsert({
      where: { caseId },
      create: { caseId, ...data },
      update: data,
    });
    await this.touchNode(caseId, 'N8', NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: 'CUSTOMS_SAVED',
      nodeCode: 'N8',
      detail: { ...dto, originEvidenceId },
    });
    return { ...row, declareElements: dto.declareElements ?? {}, originEvidenceId };
  }

  async syncEport(caseId: string, actorId?: string) {
    await this.ensureCase(caseId);
    const gate = await this.gates.evaluateAndPersist(caseId, 'N8');
    const held = !gate.canProceed;
    const status = held ? EportStatus.HELD : EportStatus.RELEASED;
    const ref = held ? `EPORT-HOLD-${Date.now()}` : `EPORT-RLS-${Date.now()}`;
    const existing = await this.prisma.customsDeclaration.findUnique({ where: { caseId } });
    if (!existing) throw new BadRequestException('请先保存报关信息再同步电子口岸');
    const ev = await this.addEvidence(caseId, 'N8', EvidenceKind.EPORT_SYNC, {
      ref,
      note: held ? '模拟电子口岸退单（申报要素/HS 缺口）' : '模拟电子口岸放行',
      payload: { status, gate },
    });
    const row = await this.prisma.customsDeclaration.update({
      where: { caseId },
      data: {
        eportStatus: status,
        eportSyncRef: ref,
        eportSyncedAt: new Date(),
      },
    });
    await this.audit.append({
      caseId,
      actorId,
      action: 'EPORT_SYNCED',
      nodeCode: 'N8',
      detail: { status, ref, evidenceId: ev.id, canProceed: gate.canProceed },
    });
    return { ...row, declareElements: safeJson(row.declareElementsJson), mock: true, gate, evidenceId: ev.id };
  }

  async saveShipment(caseId: string, dto: SaveShipmentDto, actorId?: string) {
    await this.ensureCase(caseId);
    const data = {
      hasCustomerWrittenInstruction: dto.hasCustomerWrittenInstruction,
      instructionRef: dto.instructionRef || null,
      hasInternalApproval: dto.hasInternalApproval,
      approverId: dto.approverId || undefined,
      blControl: dto.blControl || null,
      blNo: dto.blNo || null,
      vessel: dto.vessel || null,
      consigneeOnBl: dto.consigneeOnBl || null,
      noBlReason: dto.noBlReason || null,
      noBlRef: dto.noBlRef || null,
      noBlEvidenceStub: dto.noBlEvidenceStub || null,
      incotermsOverride: dto.incotermsOverride || null,
    };
    const row = await this.prisma.shipment.upsert({
      where: { caseId },
      create: { caseId, ...data },
      update: data,
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
    const { receivedAt, ...rest } = dto;
    const existing = await this.prisma.settlement.findUnique({ where: { caseId } });
    const parsedReceived =
      parseDate(receivedAt) ?? existing?.receivedAt ?? (dto.hasRemittanceMemo ? new Date() : null);
    const row = await this.prisma.settlement.upsert({
      where: { caseId },
      create: { caseId, ...rest, isThirdParty, receivedAt: parsedReceived },
      update: { ...rest, isThirdParty, receivedAt: parsedReceived },
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
    const snap = await this.gates.snapshot(caseId);
    const next = nextNode(nodeCode, snap);
    const done = nodeCode === 'N9';
    await this.prisma.tradeCase.update({
      where: { id: caseId },
      data: {
        currentNode: done ? 'N9' : next ?? nodeCode,
        status: done ? CaseStatus.COMPLETED : CaseStatus.IN_PROGRESS,
        overallRisk: result.decision === Decision.SOFT_ALERT ? RiskLevel.LOW : undefined,
      },
    });
    await this.enrollBuyerIfReachedN3(caseId, actorId);
    return { stub: false, result, nextNode: done ? null : next };
  }

  async applyWorkbench(caseId: string, input: { hitId?: string; action: string; comment?: string }, actorId?: string) {
    await this.ensureCase(caseId);
    let hit: { id: string; disposition: string; nodeCode?: string } | null = null;
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
    const nodeCode = hit?.nodeCode === 'N5' ? 'N5' : 'N1';
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
      nodeCode,
      detail: input,
    });
    const reeval: GateResult = await this.gates.evaluateAndPersist(caseId, nodeCode);
    const nodeStatus =
      reeval.decision === Decision.HARD_BLOCK
        ? NodeStatus.BLOCKED
        : reeval.decision === Decision.REVIEW
          ? NodeStatus.REVIEW
          : NodeStatus.IN_PROGRESS;
    await this.prisma.caseNode.updateMany({
      where: { caseId, code: nodeCode },
      data: { status: nodeStatus, decision: reeval.decision, summary: reeval.reasons.join('；') },
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
        currentNode: nodeCode,
      },
    });
    return { action, hit, n1: nodeCode === 'N1' ? reeval : undefined, n5: nodeCode === 'N5' ? reeval : undefined, gate: reeval };
  }

  private async screenParties(caseId: string, nodeCode: 'N1' | 'N5', roles: string[], actorId?: string) {
    const c = await this.ensureCase(caseId);
    const parties = await this.prisma.party.findMany({ where: { caseId, role: { in: roles } } });
    if (nodeCode === 'N5' && !parties.some((p) => p.name.trim())) {
      throw new BadRequestException('请先保存国内供应商再执行筛查');
    }
    await this.prisma.screeningHit.deleteMany({ where: { caseId, nodeCode } });
    const allHits: Array<Record<string, unknown> & { score: number }> = [];
    for (const p of parties) {
      const matches = await this.screening.screenName(p.nameEn || p.name);
      for (const m of matches) {
        const hit = await this.prisma.screeningHit.create({
          data: {
            caseId,
            partyId: p.id,
            nodeCode,
            listCode: m.listCode,
            listedName: m.listedName,
            matchedName: m.matchedName,
            confidence: m.confidence,
            riskLevel: m.riskLevel,
            disposition: Disposition.OPEN,
            score: m.score,
            rawJson: JSON.stringify({ source: 'mock-blacklist', partyRole: p.role, nodeCode, ...m }),
          },
        });
        allHits.push({ ...hit, partyRole: p.role, partyName: p.name });
      }
    }
    const maxScore = allHits.reduce((s, h) => Math.max(s, h.score), 0);
    const riskLevel =
      maxScore >= 80 ? RiskLevel.HIGH : maxScore >= 50 ? RiskLevel.MEDIUM : maxScore > 0 ? RiskLevel.LOW : RiskLevel.LOW;
    const subject = nodeCode === 'N5' ? '国内供应商' : '当事方';
    const summary =
      allHits.length === 0
        ? `${subject}未命中 OFAC/UN/EU/UK 及中国不可靠实体清单（模拟库）。`
        : `${subject}共 ${allHits.length} 条命中，最高分 ${maxScore}，综合风险 ${riskLevel}。`;
    const report = await this.prisma.kycReport.create({
      data: {
        caseId,
        nodeCode,
        score: maxScore,
        riskLevel,
        summary,
        payload: JSON.stringify({
          parties: parties.map((p) => ({
            role: p.role,
            roleLabel: PartyRoleLabel[p.role],
            name: p.name,
            country: p.country,
            registrationNo: p.registrationNo,
          })),
          hits: allHits,
          lists: ['OFAC', 'UN', 'EU', 'UK', 'CN_UNRELIABLE'],
          disclaimer: '本筛查为本地模拟黑名单，未连接任何真实制裁数据供应商。',
        }),
      },
    });
    await this.prisma.tradeCase.update({
      where: { id: caseId },
      data: {
        overallRisk: riskLevel,
        status: CaseStatus.IN_PROGRESS,
        ...(nodeCode === 'N5' ? { currentNode: 'N5' } : {}),
      },
    });
    await this.touchNode(caseId, nodeCode, NodeStatus.IN_PROGRESS);
    await this.audit.append({
      caseId,
      actorId,
      action: nodeCode === 'N5' ? 'SUPPLIER_SCREENED' : 'KYC_SCREENED',
      nodeCode,
      detail: { score: maxScore, riskLevel, hitCount: allHits.length },
    });
    return { caseNo: c.caseNo, report: { ...report, payload: JSON.parse(report.payload) }, hits: allHits };
  }

  private async enrollBuyerIfReachedN3(caseId: string, actorId?: string) {
    const enrolled = await this.customers.enrollBuyerForCase(caseId);
    if (!enrolled) return;
    if (!enrolled.created && !enrolled.linked) return;
    await this.audit.append({
      caseId,
      actorId,
      action: enrolled.created ? 'CUSTOMER_ENROLLED' : 'CUSTOMER_MERGED',
      nodeCode: 'N3',
      detail: { customerId: enrolled.id, name: enrolled.name, created: enrolled.created, merged: enrolled.merged },
    });
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

  private async addEvidence(
    caseId: string,
    nodeCode: string,
    kind: string,
    input: { ref?: string; note?: string; payload?: unknown },
  ) {
    return this.prisma.evidence.create({
      data: {
        caseId,
        nodeCode,
        kind,
        ref: input.ref,
        note: input.note,
        payload: JSON.stringify(input.payload ?? {}),
      },
    });
  }

  private async snapshotContract(caseId: string, changeOrderId: string | null) {
    const contract = await this.prisma.contract.findUnique({ where: { caseId } });
    if (!contract) return;
    await this.prisma.contractVersion.updateMany({
      where: { caseId, status: VersionStatus.ACTIVE },
      data: { status: VersionStatus.SUPERSEDED },
    });
    const last = await this.prisma.contractVersion.findFirst({
      where: { caseId },
      orderBy: { version: 'desc' },
    });
    await this.prisma.contractVersion.create({
      data: {
        caseId,
        version: (last?.version ?? 0) + 1,
        status: VersionStatus.ACTIVE,
        changeOrderId,
        snapshotJson: JSON.stringify(contract),
      },
    });
  }

  private async currentFieldMap(caseId: string): Promise<Record<string, string>> {
    const c = await this.prisma.tradeCase.findUnique({
      where: { id: caseId },
      include: { contract: true, parties: true },
    });
    const buyer = c?.parties.find((p) => p.role === PartyRole.BUYER)?.name || c?.contract?.buyerName || '';
    const payer = c?.parties.find((p) => p.role === PartyRole.PAYER)?.name || '';
    const consignee =
      c?.parties.find((p) => p.role === PartyRole.CONSIGNEE)?.name || c?.contract?.consigneeName || '';
    return {
      deliveryDate: c?.contract?.deliveryDate ? c.contract.deliveryDate.toISOString().slice(0, 10) : '',
      quantity: c?.contract?.quantity != null ? String(c.contract.quantity) : '',
      consigneeName: consignee,
      paymentTerms: c?.contract?.paymentTerms || '',
      payerName: payer,
      buyerName: buyer,
    };
  }
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function parseDate(v?: string | Date | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
