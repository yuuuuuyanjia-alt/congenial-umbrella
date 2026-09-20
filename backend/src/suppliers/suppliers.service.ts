import { Injectable, NotFoundException } from '@nestjs/common';
import { PartyRole } from '../common/constants';
import { evaluateRemittance, moneyBuckets, summarizeRemittance } from '../customers/remittance';
import { PrismaService } from '../prisma/prisma.service';
import { presentPlanPayment } from './payment-schedule';
import { presentSalesLink, salesContractDeliveryOf } from '../cases/sales-link';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return (await this.loadSuppliers()).map((s) => this.toListItem(s));
  }

  async get(id: string) {
    const row = (await this.loadSuppliers(id))[0];
    if (!row) throw new NotFoundException('供应商不存在');
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
    return this.prisma.supplier.upsert({
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

  private async loadSuppliers(id?: string) {
    return this.prisma.supplier.findMany({
      where: id ? { id } : undefined,
      orderBy: { name: 'asc' },
      include: {
        parties: {
          where: { role: PartyRole.SUPPLIER },
          include: {
            case: {
              include: {
                contract: true,
                procurementPlan: {
                  include: {
                    installments: { orderBy: { seq: 'asc' } },
                    salesCase: { include: { contract: true, parties: true, nodes: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  private casesOf(supplier: Awaited<ReturnType<SuppliersService['loadSuppliers']>>[number]) {
    const seen = new Set<string>();
    const cases: Array<(typeof supplier.parties)[number]['case']> = [];
    for (const p of supplier.parties) {
      if (seen.has(p.caseId)) continue;
      seen.add(p.caseId);
      cases.push(p.case);
    }
    cases.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return cases;
  }

  private purchaseOf(c: ReturnType<SuppliersService['casesOf']>[number]) {
    const plan = c.procurementPlan;
    const schedule = presentPlanPayment(plan);
    const amountFen = schedule.amountFen;
    const paidFen = schedule.paidFen;
    const unpaidFen = schedule.unpaidFen;
    const currency = plan?.currency || 'CNY';
    const payment = schedule.payment;
    const salesLink = plan?.salesCase ? presentSalesLink(plan.salesCase) : null;
    const salesContractDeliveryDate =
      salesContractDeliveryOf({
        salesLinkDelivery: salesLink?.deliveryDate,
        planContractDelivery: plan?.contractDelivery,
        caseContractDelivery: c.contract?.deliveryDate,
      }) || null;
    const dueForDelivery = plan?.plannedArrival ?? (salesContractDeliveryDate || null);
    const delivery = evaluateRemittance({
      kind: 'delivery',
      paymentDueAt: dueForDelivery,
      receivedAt: plan?.actualArrival ?? null,
    });
    return {
      id: c.id,
      caseNo: c.caseNo,
      title: c.title,
      status: c.status,
      currentNode: c.currentNode,
      goodsDesc: c.goodsDesc,
      poNo: plan?.poNo ?? null,
      plannedArrival: plan?.plannedArrival ?? null,
      contractDelivery: salesContractDeliveryDate,
      salesContractDeliveryDate,
      actualArrival: plan?.actualArrival ?? null,
      delayRegistered: plan?.delayRegistered ?? false,
      amountFen,
      currency,
      paidFen,
      unpaidFen,
      paymentDueAt: schedule.paymentDueAt,
      paidAt: schedule.paidAt,
      paymentMode: schedule.paymentMode,
      paymentModeLabel: schedule.paymentModeLabel,
      scheduleWording: schedule.wording,
      installments: schedule.installments,
      delivery,
      payment,
      hasPo: !!(plan?.poNo || plan?.amountFen || plan),
      salesCaseId: plan?.salesCaseId ?? null,
      salesLink,
    };
  }

  private toListItem(supplier: Awaited<ReturnType<SuppliersService['loadSuppliers']>>[number]) {
    const cases = this.casesOf(supplier);
    const purchases = cases.map((c) => this.purchaseOf(c));
    const payable = moneyBuckets(
      purchases.map((p) => ({ currency: p.currency, amountFen: p.amountFen, receivedOrPaidFen: p.paidFen })),
    );
    return {
      id: supplier.id,
      name: supplier.name,
      nameEn: supplier.nameEn,
      country: supplier.country,
      registrationNo: supplier.registrationNo,
      poCount: purchases.filter((p) => p.hasPo).length,
      caseCount: cases.length,
      payable,
      delivery: summarizeRemittance(purchases.map((p) => p.delivery), '无交货记录'),
      payment: summarizeRemittance(purchases.map((p) => p.payment), '无付款约定'),
      hasStaged: purchases.some((p) => p.paymentMode === 'STAGED'),
    };
  }

  private toDetail(supplier: Awaited<ReturnType<SuppliersService['loadSuppliers']>>[number]) {
    const cases = this.casesOf(supplier);
    const purchases = cases.map((c) => this.purchaseOf(c));
    return {
      id: supplier.id,
      name: supplier.name,
      nameEn: supplier.nameEn,
      country: supplier.country,
      address: supplier.address,
      registrationNo: supplier.registrationNo,
      note: supplier.note,
      poCount: purchases.filter((p) => p.hasPo).length,
      caseCount: cases.length,
      payable: moneyBuckets(
        purchases.map((p) => ({ currency: p.currency, amountFen: p.amountFen, receivedOrPaidFen: p.paidFen })),
      ),
      delivery: summarizeRemittance(purchases.map((p) => p.delivery), '无交货记录'),
      payment: summarizeRemittance(purchases.map((p) => p.payment), '无付款约定'),
      hasStaged: purchases.some((p) => p.paymentMode === 'STAGED'),
      purchases,
    };
  }
}
