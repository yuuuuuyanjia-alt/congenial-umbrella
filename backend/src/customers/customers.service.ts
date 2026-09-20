import { Injectable, NotFoundException } from '@nestjs/common';
import { PartyRole } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { enrollBuyerForCase, EnrollResult } from './customer-enroll';
import { hasReachedN3 } from './customer-match';
import {
  derivePaymentDueAt,
  evaluateRemittance,
  moneyBuckets,
  summarizeRemittance,
} from './remittance';
import {
  ExposureContractInput,
  evaluateBuyerOccupancy,
  isExportFulfilled,
  occupancyNewContractOpts,
  receivedFenOf,
} from './sinosure-exposure';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const customers = await this.loadCustomers();
    return customers.map((c) => this.toListItem(c)).filter((c) => c.caseCount > 0);
  }

  async get(id: string) {
    const customers = await this.loadCustomers(id);
    const row = customers[0];
    if (!row) throw new NotFoundException('客户不存在');
    return this.toDetail(row);
  }

  /** 案件已到达 N3 时录入/合并买方；未到达则返回 null。 */
  async enrollBuyerForCase(caseId: string): Promise<EnrollResult | null> {
    return enrollBuyerForCase(this.prisma, caseId);
  }

  private async loadCustomers(id?: string) {
    return this.prisma.customer.findMany({
      where: id ? { id } : undefined,
      orderBy: { name: 'asc' },
      include: {
        parties: {
          where: { role: PartyRole.BUYER },
          include: {
            case: {
              include: {
                contract: true,
                settlement: true,
                sinosurePolicies: { orderBy: { createdAt: 'desc' } },
                nodes: true,
              },
            },
          },
        },
      },
    });
  }

  private casesOf(customer: Awaited<ReturnType<CustomersService['loadCustomers']>>[number]) {
    const seen = new Set<string>();
    const cases: Array<(typeof customer.parties)[number]['case']> = [];
    for (const p of customer.parties) {
      if (seen.has(p.caseId)) continue;
      const n3 = p.case.nodes.find((n) => n.code === 'N3');
      if (!hasReachedN3(p.case.currentNode, n3?.status)) continue;
      seen.add(p.caseId);
      cases.push(p.case);
    }
    cases.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return cases;
  }

  private latestSinosure(cases: ReturnType<CustomersService['casesOf']>) {
    let latest: (NonNullable<ReturnType<CustomersService['casesOf']>[number]['sinosurePolicies']>[number] & {
      caseNo: string;
    }) | null = null;
    for (const c of cases) {
      for (const p of c.sinosurePolicies) {
        if (!latest || p.createdAt.getTime() >= latest.createdAt.getTime()) {
          latest = { ...p, caseNo: c.caseNo };
        }
      }
    }
    if (!latest) return null;
    return {
      insuredLimitFen: latest.insuredLimitFen,
      currency: latest.currency,
      evidenceRef: latest.evidenceRef,
      fileName: latest.fileName,
      nodeCode: latest.nodeCode,
      caseId: latest.caseId,
      caseNo: latest.caseNo,
      createdAt: latest.createdAt,
    };
  }

  private moneyOf(c: ReturnType<CustomersService['casesOf']>[number]) {
    const amountFen = c.contract?.amountFen ?? (c.contract ? c.amountFen : 0);
    const currency = c.contract?.currency || c.currency || 'USD';
    const receivedFen = receivedFenOf(c.settlement, amountFen);
    const unpaidFen = Math.max(0, amountFen - receivedFen);
    return { amountFen, currency, receivedFen, unpaidFen };
  }

  private toExposureRow(c: ReturnType<CustomersService['casesOf']>[number]): ExposureContractInput {
    const money = this.moneyOf(c);
    return {
      id: c.id,
      caseNo: c.caseNo,
      title: c.title,
      hasContract: !!c.contract,
      amountFen: money.amountFen,
      currency: money.currency,
      receivedFen: money.receivedFen,
      status: c.status,
      currentNode: c.currentNode,
      nodes: c.nodes.map((n) => ({ code: n.code, status: n.status })),
    };
  }

  occupancyFromCases(
    cases: ReturnType<CustomersService['casesOf']>,
    opts?: {
      newCaseId?: string | null;
      newAmountFen?: number | null;
      newCurrency?: string | null;
    },
  ) {
    const sino = this.latestSinosure(cases);
    return evaluateBuyerOccupancy(
      cases.map((c) => this.toExposureRow(c)),
      {
        insuredLimitFen: sino?.insuredLimitFen ?? null,
        limitCurrency: sino?.currency ?? null,
        newCaseId: opts?.newCaseId ?? null,
        newAmountFen: opts?.newAmountFen ?? 0,
        newCurrency: opts?.newCurrency || sino?.currency || 'USD',
      },
    );
  }

  async occupancyForCase(
    caseId: string,
    override?: { newAmountFen?: number | null; newCurrency?: string | null },
  ) {
    const party = await this.prisma.party.findFirst({
      where: { caseId, role: PartyRole.BUYER },
      include: { customer: true },
    });
    const self = await this.prisma.tradeCase.findUnique({
      where: { id: caseId },
      include: {
        contract: true,
        settlement: true,
        sinosurePolicies: { orderBy: { createdAt: 'desc' } },
        nodes: true,
      },
    });
    if (!self) throw new NotFoundException('案件不存在');

    const customerId = party?.customerId ?? null;
    const buyerName = party?.name?.trim();
    const relatedParties = await this.prisma.party.findMany({
      where: {
        role: PartyRole.BUYER,
        ...(customerId
          ? { customerId }
          : buyerName
            ? { name: buyerName }
            : { caseId }),
      },
      include: {
        case: {
          include: {
            contract: true,
            settlement: true,
            sinosurePolicies: { orderBy: { createdAt: 'desc' } },
            nodes: true,
          },
        },
      },
    });
    const seen = new Set<string>();
    const cases: typeof self[] = [];
    for (const p of relatedParties) {
      if (seen.has(p.caseId)) continue;
      seen.add(p.caseId);
      cases.push(p.case);
    }
    if (!seen.has(self.id)) cases.push(self);

    return this.occupancyFromCases(cases as unknown as ReturnType<CustomersService['casesOf']>, {
      ...occupancyNewContractOpts(self, override),
    });
  }

  private caseRemittance(c: ReturnType<CustomersService['casesOf']>[number]) {
    const money = this.moneyOf(c);
    const paymentDueAt =
      c.contract?.paymentDueAt ?? derivePaymentDueAt(c.contract?.deliveryDate, c.contract?.paymentTerms);
    return {
      ...evaluateRemittance({
        kind: 'collection',
        paymentDueAt,
        receivedAt: c.settlement?.receivedAt ?? null,
        remainingFen: c.contract || c.settlement ? money.unpaidFen : null,
      }),
      ...money,
    };
  }

  private toListItem(customer: Awaited<ReturnType<CustomersService['loadCustomers']>>[number]) {
    const cases = this.casesOf(customer);
    const remits = cases.map((c) => this.caseRemittance(c));
    const summary = summarizeRemittance(remits, '无收款约定');
    const sino = this.latestSinosure(cases);
    const latestCase = cases[cases.length - 1] ?? null;
    const receivable = moneyBuckets(
      remits.map((r) => ({ currency: r.currency, amountFen: r.amountFen, receivedOrPaidFen: r.receivedFen })),
    );
    const exposure = this.occupancyFromCases(cases);
    return {
      id: customer.id,
      name: customer.name,
      nameEn: customer.nameEn,
      country: customer.country,
      caseCount: cases.length,
      contractCount: cases.filter((c) => c.contract).length,
      sinosureLimit: sino
        ? {
            insuredLimitFen: sino.insuredLimitFen,
            currency: sino.currency,
            evidenceRef: sino.evidenceRef,
            caseNo: sino.caseNo,
          }
        : null,
      exposure: {
        occupancyFen: exposure.occupancyFen,
        insuredLimitFen: exposure.insuredLimitFen,
        remainingFen: exposure.remainingFen,
        excessFen: exposure.excessFen,
        band: exposure.band,
        bandLabel: exposure.bandLabel,
        gateDecision: exposure.gateDecision,
        currency: exposure.currency,
        summary: exposure.summary,
      },
      receivable,
      remittance: summary,
      collection: summary,
      latestCase: latestCase
        ? { id: latestCase.id, caseNo: latestCase.caseNo, title: latestCase.title, status: latestCase.status }
        : null,
    };
  }

  private toDetail(customer: Awaited<ReturnType<CustomersService['loadCustomers']>>[number]) {
    const cases = this.casesOf(customer);
    const transactions = cases.map((c) => {
      const remittance = this.caseRemittance(c);
      const sino = c.sinosurePolicies[0] ?? null;
      return {
        id: c.id,
        caseNo: c.caseNo,
        title: c.title,
        status: c.status,
        currentNode: c.currentNode,
        goodsDesc: c.goodsDesc,
        destination: c.destination,
        amountFen: remittance.amountFen,
        currency: remittance.currency,
        receivedFen: remittance.receivedFen,
        unpaidFen: remittance.unpaidFen,
        paymentTerms: c.contract?.paymentTerms ?? null,
        deliveryDate: c.contract?.deliveryDate ?? null,
        paymentDueAt: remittance.paymentDueAt,
        receivedAt: remittance.receivedAt,
        remittance,
        collection: remittance,
        hasContract: !!c.contract,
        fulfillment: c.contract
          ? isExportFulfilled({ status: c.status, currentNode: c.currentNode, nodes: c.nodes })
            ? 'FULFILLED'
            : 'OPEN'
          : 'NONE',
        contract: c.contract
          ? {
              counterparty: c.contract.counterparty,
              incoterms: c.contract.incoterms,
              paymentTerms: c.contract.paymentTerms,
              amountFen: c.contract.amountFen,
              currency: c.contract.currency,
              deliveryDate: c.contract.deliveryDate,
              quantity: c.contract.quantity,
              unit: c.contract.unit,
              isFinal: c.contract.isFinal,
            }
          : null,
        sinosure: sino
          ? {
              insuredLimitFen: sino.insuredLimitFen,
              currency: sino.currency,
              evidenceRef: sino.evidenceRef,
              fileName: sino.fileName,
            }
          : null,
      };
    });
    const remittance = summarizeRemittance(transactions.map((t) => t.remittance), '无收款约定');
    const contracts = transactions.filter((t) => t.hasContract);
    const exposure = this.occupancyFromCases(cases);
    return {
      id: customer.id,
      name: customer.name,
      nameEn: customer.nameEn,
      country: customer.country,
      address: customer.address,
      registrationNo: customer.registrationNo,
      note: customer.note,
      caseCount: transactions.length,
      contractCount: contracts.length,
      sinosureLimit: this.latestSinosure(cases),
      exposure,
      receivable: moneyBuckets(
        transactions.map((t) => ({
          currency: t.currency,
          amountFen: t.amountFen,
          receivedOrPaidFen: t.receivedFen,
        })),
      ),
      remittance,
      collection: remittance,
      contracts,
      transactions,
    };
  }
}
