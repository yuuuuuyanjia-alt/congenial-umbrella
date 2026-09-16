import { Injectable, NotFoundException } from '@nestjs/common';
import { PartyRole } from '../common/constants';
import { PrismaService } from '../prisma/prisma.service';
import {
  derivePaymentDueAt,
  evaluateRemittance,
  moneyBuckets,
  summarizeRemittance,
} from './remittance';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const customers = await this.loadCustomers();
    return customers.map((c) => this.toListItem(c));
  }

  async get(id: string) {
    const customers = await this.loadCustomers(id);
    const row = customers[0];
    if (!row) throw new NotFoundException('客户不存在');
    return this.toDetail(row);
  }

  async findOrCreateFromParty(input: {
    name: string;
    nameEn?: string | null;
    country?: string | null;
    address?: string | null;
    registrationNo?: string | null;
  }) {
    const name = input.name.trim();
    if (!name) return null;
    return this.prisma.customer.upsert({
      where: { name },
      create: {
        name,
        nameEn: input.nameEn ?? null,
        country: input.country ?? null,
        address: input.address ?? null,
        registrationNo: input.registrationNo ?? null,
      },
      update: {
        ...(input.nameEn ? { nameEn: input.nameEn } : {}),
        ...(input.country ? { country: input.country } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.registrationNo ? { registrationNo: input.registrationNo } : {}),
      },
    });
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
                nodes: { where: { code: 'N9' } },
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
    const receivedFen =
      c.settlement?.receivedAt || c.settlement?.hasRemittanceMemo
        ? (c.settlement?.amountFen ?? (c.settlement?.receivedAt ? amountFen : 0))
        : 0;
    const unpaidFen = Math.max(0, amountFen - receivedFen);
    return { amountFen, currency, receivedFen, unpaidFen };
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
