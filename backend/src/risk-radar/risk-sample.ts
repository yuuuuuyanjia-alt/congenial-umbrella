import { NODE_CATALOG, NodeStatus } from '../common/constants';
import { countryKey, nameKey } from '../customers/customer-match';
import { PrismaService } from '../prisma/prisma.service';
import { classifyConfidence } from '../screening/matcher';
import { RiskColor, RiskStatus, RiskType, addUtcDays } from './risk-rules';

/**
 * 示例风险只写入 isSample=true 的行。重复生成会先删旧示例。
 * 灰色没有自动规则：直接写一条「买方评分小幅下滑」，preserveOnRecalc=true，
 * 重算时不会被系统关闭，也不会被升成红色。
 */

const RED_NAME = 'Banned Sample Trading';
const ORANGE_NAME = 'Suspect Gear Ltd';
const YELLOW_NAME = 'Pacific Tools Sample';
const YELLOW_LISTED = 'Pacifik Toolz Sample';

export async function clearSampleData(prisma: PrismaService) {
  await prisma.riskItem.deleteMany({
    where: {
      OR: [
        { isSample: true },
        { case: { isSample: true } },
        { customer: { isSample: true } },
        { supplier: { isSample: true } },
      ],
    },
  });
  await prisma.auditLog.deleteMany({ where: { case: { isSample: true } } });
  await prisma.tradeCase.deleteMany({ where: { isSample: true } });
  await prisma.customer.deleteMany({ where: { isSample: true } });
  await prisma.supplier.deleteMany({ where: { isSample: true } });
  await prisma.blacklistEntry.deleteMany({ where: { isSample: true } });
  await prisma.sinosurePolicy.deleteMany({ where: { isSample: true } });
}

export async function generateSampleData(prisma: PrismaService, salesUserId: string) {
  const low = classifyConfidence(YELLOW_NAME, YELLOW_LISTED);
  if (low !== 'LOW') {
    throw new Error(`示例低置信名称当前匹配结果是 ${low}，需要低置信`);
  }
  if (classifyConfidence(RED_NAME, RED_NAME) !== 'HIGH') {
    throw new Error('示例确认命中名称应为高置信精确匹配');
  }
  if (classifyConfidence(ORANGE_NAME, ORANGE_NAME) !== 'HIGH') {
    throw new Error('示例疑似命中名称应为高置信精确匹配');
  }

  await clearSampleData(prisma);

  const today = new Date();
  const arrival = addUtcDays(today, -33);
  const n6PassedAt = addUtcDays(today, -40);

  await prisma.blacklistEntry.createMany({
    data: [
      { listCode: 'OFAC', name: RED_NAME, aliases: '[]', country: 'XX', note: '示例确认命中', isSample: true },
      { listCode: 'OFAC', name: ORANGE_NAME, aliases: '[]', country: 'SG', note: '示例高置信疑似', isSample: true },
      { listCode: 'EU', name: YELLOW_LISTED, aliases: '[]', country: 'DE', note: '示例低置信', isSample: true },
    ],
  });

  const redCustomer = await createCustomer(prisma, RED_NAME, 'XX');
  const yellowCustomer = await createCustomer(prisma, YELLOW_NAME, 'DE');
  const occupancyCustomer = await createCustomer(prisma, '示例额度买方', 'US');
  const overdueCustomer = await createCustomer(prisma, '示例逾期买方', 'NL');
  const docCustomer = await createCustomer(prisma, '示例单证买方', 'FR');
  const grayCustomer = await createCustomer(prisma, '示例评分买方', 'JP');
  const supplier = await prisma.supplier.create({
    data: { name: ORANGE_NAME, country: 'CN', isSample: true },
  });

  const redCase = await createCase(prisma, {
    caseNo: '示例-制裁确认',
    title: '示例确认制裁命中',
    buyer: redCustomer,
    currency: 'CNY',
    amountFen: 1_000_000,
    incoterms: 'FOB',
    currentNode: 'N3',
    salesUserId,
  });
  await hit(prisma, redCase.partyId, redCase.caseId, {
    listCode: 'OFAC',
    listedName: RED_NAME,
    matchedName: RED_NAME,
    confidence: 'HIGH',
    riskLevel: 'HIGH',
    disposition: 'CONFIRMED_TRUE',
    score: 98,
    nodeCode: 'N3',
  });

  const orangeCase = await createCase(prisma, {
    caseNo: '示例-制裁疑似',
    title: '示例高置信疑似命中',
    buyerName: '示例疑似合同买方',
    buyerCountry: 'SG',
    supplier,
    currency: 'CNY',
    amountFen: 1_000_000,
    incoterms: 'FOB',
    currentNode: 'N5',
    salesUserId,
  });
  await hit(prisma, orangeCase.supplierPartyId!, orangeCase.caseId, {
    listCode: 'OFAC',
    listedName: ORANGE_NAME,
    matchedName: ORANGE_NAME,
    confidence: 'HIGH',
    riskLevel: 'HIGH',
    disposition: 'OPEN',
    score: 98,
    nodeCode: 'N5',
  });

  const yellowCase = await createCase(prisma, {
    caseNo: '示例-制裁低置信',
    title: '示例低置信命中',
    buyer: yellowCustomer,
    currency: 'CNY',
    amountFen: 1_000_000,
    incoterms: 'FOB',
    currentNode: 'N3',
    salesUserId,
  });
  await hit(prisma, yellowCase.partyId, yellowCase.caseId, {
    listCode: 'EU',
    listedName: YELLOW_LISTED,
    matchedName: YELLOW_NAME,
    confidence: 'LOW',
    riskLevel: 'LOW',
    disposition: 'OPEN',
    score: 28,
    nodeCode: 'N3',
  });

  await createCase(prisma, {
    caseNo: '示例-额度占用',
    title: '示例中信保额度 85%',
    buyer: occupancyCustomer,
    currency: 'USD',
    amountFen: 8_500_000,
    incoterms: 'FOB',
    currentNode: 'N5',
    n3Passed: true,
    limitFen: 10_000_000,
    salesUserId,
  });

  await createCase(prisma, {
    caseNo: '示例-逾期应收',
    title: '示例后 T/T 逾期',
    buyer: overdueCustomer,
    currency: 'USD',
    amountFen: 2_000_000,
    incoterms: 'FOB',
    ttTiming: 'AFTER',
    ttDaysAfterShipment: 30,
    currentNode: 'N7',
    n3Passed: true,
    n6PassedAt,
    arrival,
    limitFen: 10_000_000,
    salesUserId,
  });

  const docKinds = [
    'N7_SALES_CONTRACT',
    'N7_COMMERCIAL_INVOICE',
    'N7_PACKING',
    'N7_PURCHASE_CONTRACT',
    'N7_INVOICE',
    'N7_CUSTOMS',
  ];
  await createCase(prisma, {
    caseNo: '示例-单证缺失',
    title: '示例非 FOB 缺原产地证',
    buyer: docCustomer,
    currency: 'CNY',
    amountFen: 1_000_000,
    incoterms: 'CIF',
    currentNode: 'N9',
    n3Passed: true,
    n6PassedAt,
    n7PassedAt: addUtcDays(today, -2),
    evidenceKinds: docKinds,
    salesUserId,
  });

  const gray = await createCase(prisma, {
    caseNo: '示例-评分提醒',
    title: '示例买方评分小幅下滑',
    buyer: grayCustomer,
    currency: 'CNY',
    amountFen: 500_000,
    incoterms: 'FOB',
    currentNode: 'N3',
    n3Passed: true,
    salesUserId,
  });

  // 第一版没有灰色规则。这条是演示提醒，重算不能系统关闭，也不能自动变红。
  await prisma.riskItem.create({
    data: {
      type: RiskType.SAMPLE_NOTICE,
      color: RiskColor.GRAY,
      ruleColor: RiskColor.GRAY,
      status: RiskStatus.PENDING,
      fingerprint: `SAMPLE_NOTICE|${gray.caseId}`,
      caseId: gray.caseId,
      customerId: grayCustomer.id,
      title: '买方评分小幅下滑',
      subjectLabel: '示例-评分提醒',
      linesJson: JSON.stringify([
        {
          code: 'SAMPLE_SCORE_DIP',
          text: '示例提醒：买方评分较上次小幅下滑。第一版没有灰色规则，本条仅作演示，重算不会系统关闭。',
        },
      ]),
      isSample: true,
      preserveOnRecalc: true,
    },
  });
}

async function createCustomer(prisma: PrismaService, name: string, country: string) {
  return prisma.customer.create({
    data: {
      name,
      country,
      nameKey: nameKey(name),
      countryKey: countryKey(country),
      isSample: true,
    },
  });
}

async function createCase(
  prisma: PrismaService,
  input: {
    caseNo: string;
    title: string;
    buyer?: { id: string; name: string; country: string | null };
    buyerName?: string;
    buyerCountry?: string;
    supplier?: { id: string; name: string };
    currency: string;
    amountFen: number;
    incoterms: string;
    ttTiming?: string | null;
    ttDaysAfterShipment?: number | null;
    currentNode: string;
    n3Passed?: boolean;
    n6PassedAt?: Date | null;
    n7PassedAt?: Date | null;
    arrival?: Date | null;
    limitFen?: number | null;
    evidenceKinds?: string[];
    salesUserId: string;
  },
) {
  const buyerName = input.buyer?.name || input.buyerName || '示例买方';
  const buyerCountry = input.buyer?.country || input.buyerCountry || '';
  const created = await prisma.tradeCase.create({
    data: {
      caseNo: input.caseNo,
      title: input.title,
      scenario: 'SAMPLE',
      status: 'IN_PROGRESS',
      currentNode: input.currentNode,
      overallRisk: 'LOW',
      goodsDesc: '示例货物',
      destination: '示例目的港',
      amountFen: input.amountFen,
      currency: input.currency,
      isSample: true,
      nodes: {
        create: NODE_CATALOG.map((n) => ({
          code: n.code,
          name: n.name,
          status: n.code === 'N3' && input.n3Passed ? NodeStatus.PASSED : n.code === 'N2' ? NodeStatus.PASSED : NodeStatus.NOT_STARTED,
          isStub: false,
          isHardGate: n.isHardGate,
          summary: n.summary,
          completedAt: n.code === 'N3' && input.n3Passed ? new Date() : null,
        })),
      },
      contract: {
        create: {
          counterparty: buyerName,
          buyerName,
          incoterms: input.incoterms,
          ttTiming: input.ttTiming ?? null,
          ttDaysAfterShipment: input.ttDaysAfterShipment ?? null,
          amountFen: input.amountFen,
          currency: input.currency,
          isFinal: true,
          goodsDesc: '示例货物',
          destination: '示例目的港',
        },
      },
    },
  });
  const buyer = await prisma.party.create({
    data: {
      caseId: created.id,
      customerId: input.buyer?.id,
      role: 'BUYER',
      name: buyerName,
      country: buyerCountry,
    },
  });
  let supplierPartyId: string | null = null;
  if (input.supplier) {
    const supplierParty = await prisma.party.create({
      data: {
        caseId: created.id,
        supplierId: input.supplier.id,
        role: 'SUPPLIER',
        name: input.supplier.name,
        country: 'CN',
      },
    });
    supplierPartyId = supplierParty.id;
  }
  const batch = await prisma.shipmentBatch.create({
    data: {
      caseId: created.id,
      batchNo: '1',
      seq: 1,
      amountFen: input.amountFen,
      currency: input.currency,
      currentNode: input.n7PassedAt ? 'N9' : input.n6PassedAt ? 'N7' : 'N6',
      status: input.n6PassedAt ? 'IN_PROGRESS' : 'NOT_STARTED',
      etaDate: input.arrival ?? null,
      nodes: {
        create: [
          {
            code: 'N6',
            status: input.n6PassedAt ? NodeStatus.PASSED : NodeStatus.NOT_STARTED,
            completedAt: input.n6PassedAt ?? null,
          },
          {
            code: 'N7',
            status: input.n7PassedAt ? NodeStatus.PASSED : NodeStatus.NOT_STARTED,
            completedAt: input.n7PassedAt ?? null,
          },
          { code: 'N9', status: NodeStatus.NOT_STARTED },
        ],
      },
    },
  });
  if (input.limitFen) {
    await prisma.sinosurePolicy.create({
      data: {
        caseId: created.id,
        nodeCode: 'N3',
        insuredLimitFen: input.limitFen,
        currency: 'USD',
        isSample: true,
        fileName: '示例保单.pdf',
      },
    });
  }
  if (input.evidenceKinds?.length) {
    await prisma.evidence.createMany({
      data: input.evidenceKinds.map((kind) => ({
        caseId: created.id,
        batchId: batch.id,
        nodeCode: 'N7',
        kind,
        ref: `sample-${kind}`,
        payload: JSON.stringify({ storageKey: `sample/${kind}.pdf`, fileName: `${kind}.pdf` }),
      })),
    });
  }
  await prisma.auditLog.create({
    data: {
      caseId: created.id,
      actorId: input.salesUserId,
      action: 'CASE_CREATED',
      nodeCode: 'N2',
      detail: JSON.stringify({ sample: true, caseNo: input.caseNo }),
    },
  });
  return { caseId: created.id, partyId: buyer.id, supplierPartyId, batchId: batch.id };
}

async function hit(
  prisma: PrismaService,
  partyId: string,
  caseId: string,
  input: {
    listCode: string;
    listedName: string;
    matchedName: string;
    confidence: string;
    riskLevel: string;
    disposition: string;
    score: number;
    nodeCode: string;
  },
) {
  await prisma.screeningHit.create({
    data: {
      caseId,
      partyId,
      nodeCode: input.nodeCode,
      listCode: input.listCode,
      listedName: input.listedName,
      matchedName: input.matchedName,
      confidence: input.confidence,
      riskLevel: input.riskLevel,
      disposition: input.disposition,
      score: input.score,
      rawJson: JSON.stringify({ source: 'sample', ...input }),
    },
  });
}
