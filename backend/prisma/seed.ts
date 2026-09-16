import { PrismaClient } from '@prisma/client';
import { NODE_CATALOG } from '../src/common/constants';

const prisma = new PrismaClient();

const LISTS = [
  {
    listCode: 'OFAC',
    name: 'BANNED TRADING LLC',
    aliases: JSON.stringify(['BANNED TRADING', 'BANNED TRADING COMPANY']),
    country: 'IR',
    note: '模拟 OFAC SDN 精确命中样本（硬拦截演示）',
  },
  {
    listCode: 'OFAC',
    name: 'ACME INDUSTRIES LIMITED',
    aliases: JSON.stringify([]),
    country: 'CY',
    note: '模拟近似名称样本（软提示演示）',
  },
  {
    listCode: 'UN',
    name: 'SHADOW SHIPPING SA',
    aliases: JSON.stringify(['SHADOW SHIPPING']),
    country: 'PA',
    note: '模拟联合国制裁清单',
  },
  {
    listCode: 'EU',
    name: 'FROZEN ASSETS HOLDINGS',
    aliases: JSON.stringify(['FROZEN ASSET HOLDINGS']),
    country: 'RU',
    note: '模拟欧盟清单（中置信审核队列）',
  },
  {
    listCode: 'UK',
    name: 'NORTHWIND SANCTIONED CORP',
    aliases: JSON.stringify([]),
    country: 'GB',
    note: '模拟英国 OFSI',
  },
  {
    listCode: 'CN_UNRELIABLE',
    name: '某不可靠实体贸易有限公司',
    aliases: JSON.stringify(['某不可靠实体']),
    country: 'CN',
    note: '模拟中国不可靠实体清单',
  },
];

async function main() {
  await prisma.gateCheck.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.workbenchAction.deleteMany();
  await prisma.docMismatchFix.deleteMany();
  await prisma.tradeDocument.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.kycReport.deleteMany();
  await prisma.screeningHit.deleteMany();
  await prisma.party.deleteMany();
  await prisma.caseNode.deleteMany();
  await prisma.tradeCase.deleteMany();
  await prisma.blacklistEntry.deleteMany();
  await prisma.user.deleteMany();

  const [sales, compliance, approver, finance] = await Promise.all([
    prisma.user.create({ data: { name: '王磊', role: 'SALES' } }),
    prisma.user.create({ data: { name: '陈可', role: 'COMPLIANCE' } }),
    prisma.user.create({ data: { name: '赵衡', role: 'APPROVER' } }),
    prisma.user.create({ data: { name: '孙琪', role: 'FINANCE' } }),
  ]);
  void finance;

  await prisma.blacklistEntry.createMany({ data: LISTS });

  const pass = await seedPassCase(sales.id, approver.id, compliance.id);
  const soft = await seedSoftCase(sales.id, compliance.id);
  const block = await seedBlockCase(sales.id, compliance.id);
  const gate = await seedGateDemoCase(sales.id);

  console.log('种子数据已写入：');
  console.log('  PASS      ', pass.caseNo, pass.id);
  console.log('  SOFT_ALERT', soft.caseNo, soft.id);
  console.log('  HARD_BLOCK', block.caseNo, block.id);
  console.log('  GATE_DEMO ', gate.caseNo, gate.id, '（N6 缺证据，用于闸门拒绝演示）');
}

function nodeCreates(overrides: Record<string, Partial<{ status: string; decision: string | null; summary: string }>>) {
  return NODE_CATALOG.map((n) => ({
    code: n.code,
    name: n.name,
    isStub: n.isStub,
    isHardGate: n.isHardGate,
    status: n.isStub ? 'STUB_TODO' : overrides[n.code]?.status ?? 'NOT_STARTED',
    decision: overrides[n.code]?.decision ?? null,
    summary: overrides[n.code]?.summary ?? n.summary,
    completedAt: overrides[n.code]?.status === 'PASSED' ? new Date() : null,
  }));
}

async function seedPassCase(salesId: string, approverId: string, complianceId: string) {
  const fields = {
    buyerName: 'Nordlicht GmbH',
    consigneeName: 'Nordlicht GmbH',
    goodsDesc: '数控机床配件',
    amountFen: 12800000,
    currency: 'USD',
    incoterms: 'CIF',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-PASS',
      title: '北海机电出口德国 Nordlicht（绿灯通过）',
      scenario: 'PASS',
      status: 'COMPLETED',
      currentNode: 'N9',
      overallRisk: 'LOW',
      goodsDesc: '数控机床配件',
      destination: 'Hamburg, DE',
      amountFen: 12800000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
        ],
      },
      nodes: { create: nodeCreates(passNodes()) },
      contract: {
        create: {
          counterparty: 'Nordlicht GmbH',
          paymentTerms: 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: true,
          ...fields,
          destination: 'Hamburg',
        },
      },
      shipment: {
        create: {
          hasCustomerWrittenInstruction: true,
          instructionRef: 'INST-NL-2026-011',
          hasInternalApproval: true,
          approverId,
          blControl: 'ORIGINAL',
          blNo: 'COSU8899001',
          vessel: 'EVER GIVEN',
          consigneeOnBl: 'Nordlicht GmbH',
        },
      },
      documents: {
        create: ['CONTRACT', 'INVOICE', 'PACKING', 'BL'].map((type) => ({
          type,
          isFinal: true,
          fieldsJson: JSON.stringify(fields),
        })),
      },
      settlement: {
        create: {
          payerName: 'Nordlicht GmbH',
          buyerName: 'Nordlicht GmbH',
          isThirdParty: false,
          hasThirdPartyProof: false,
          hasRemittanceMemo: true,
          remittanceMemoRef: 'SWIFT MT103 / INV-NL-011',
          hasDocConsistencyProof: true,
          hasReleaseApproval: true,
          amountFen: 12800000,
        },
      },
      kycReports: {
        create: {
          score: 0,
          riskLevel: 'LOW',
          summary: '未命中 OFAC/UN/EU/UK 及中国不可靠实体清单（模拟库）。',
          payload: JSON.stringify({ hits: [], disclaimer: 'mock' }),
        },
      },
    },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        caseId: c.id,
        actorId: salesId,
        action: 'CASE_CREATED',
        nodeCode: 'N1',
        detail: JSON.stringify({ scenario: 'PASS' }),
      },
      {
        caseId: c.id,
        actorId: complianceId,
        action: 'KYC_SCREENED',
        nodeCode: 'N1',
        detail: JSON.stringify({ score: 0, riskLevel: 'LOW' }),
      },
      {
        caseId: c.id,
        actorId: salesId,
        action: 'NODE_ADVANCED',
        nodeCode: 'N9',
        detail: JSON.stringify({ decision: 'PASS' }),
      },
    ],
  });
  return c;
}

function passNodes() {
  return {
    N1: { status: 'PASSED', decision: 'PASS', summary: '当事方齐全，筛查未命中' },
    N3: { status: 'PASSED', decision: 'PASS', summary: '所有权保留与争议条款齐全' },
    N6: { status: 'PASSED', decision: 'PASS', summary: '书面指示、内部审批、正本提单控制齐全' },
    N7: { status: 'PASSED', decision: 'PASS', summary: '终稿合同与单证字段一致' },
    N9: { status: 'PASSED', decision: 'PASS', summary: '收汇硬闸门证据齐全并已放行' },
  };
}

async function seedSoftCase(salesId: string, complianceId: string) {
  const buyer = 'Acme Industrial Co';
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-SOFT',
      title: '华东工具出口 Acme Industrial（软提示不阻断）',
      scenario: 'SOFT_ALERT',
      status: 'IN_PROGRESS',
      currentNode: 'N3',
      overallRisk: 'LOW',
      goodsDesc: '手工具套装',
      destination: 'Los Angeles, US',
      amountFen: 3600000,
      parties: {
        create: [
          { role: 'BUYER', name: buyer, country: 'US', isSameAsBuyer: true },
          { role: 'PAYER', name: buyer, country: 'US', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: buyer, country: 'US', isSameAsBuyer: true },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: {
            status: 'PASSED',
            decision: 'SOFT_ALERT',
            summary: '低置信命中 ACME INDUSTRIES LIMITED，软提示不阻断',
          },
        }),
      },
    },
  });
  const party = await prisma.party.findFirst({ where: { caseId: c.id, role: 'BUYER' } });
  await prisma.screeningHit.create({
    data: {
      caseId: c.id,
      partyId: party!.id,
      listCode: 'OFAC',
      listedName: 'ACME INDUSTRIES LIMITED',
      matchedName: buyer,
      confidence: 'LOW',
      riskLevel: 'LOW',
      disposition: 'OPEN',
      score: 28,
      rawJson: JSON.stringify({ source: 'mock-blacklist', note: '名称近似，低置信' }),
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      score: 28,
      riskLevel: 'LOW',
      summary: '低置信命中 OFAC 模拟条目 ACME INDUSTRIES LIMITED，软提示，不阻断。',
      payload: JSON.stringify({ hits: 1, decision: 'SOFT_ALERT' }),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        caseId: c.id,
        actorId: salesId,
        action: 'CASE_CREATED',
        nodeCode: 'N1',
        detail: JSON.stringify({ scenario: 'SOFT_ALERT' }),
      },
      {
        caseId: c.id,
        actorId: complianceId,
        action: 'KYC_SCREENED',
        nodeCode: 'N1',
        detail: JSON.stringify({ decision: 'SOFT_ALERT', score: 28 }),
      },
      {
        caseId: c.id,
        actorId: salesId,
        action: 'NODE_ADVANCED',
        nodeCode: 'N1',
        detail: JSON.stringify({ canProceed: true, decision: 'SOFT_ALERT' }),
      },
    ],
  });
  return c;
}

async function seedBlockCase(salesId: string, complianceId: string) {
  const buyer = 'Banned Trading LLC';
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-BLOCK',
      title: '华南汽配询盘 Banned Trading（高置信硬拦截）',
      scenario: 'HARD_BLOCK',
      status: 'BLOCKED',
      currentNode: 'N1',
      overallRisk: 'HIGH',
      goodsDesc: '汽车制动组件',
      destination: 'Bandar Abbas',
      amountFen: 8800000,
      parties: {
        create: [
          { role: 'BUYER', name: buyer, country: 'IR', isSameAsBuyer: true },
          { role: 'PAYER', name: buyer, country: 'IR', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: buyer, country: 'IR', isSameAsBuyer: true },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: {
            status: 'BLOCKED',
            decision: 'HARD_BLOCK',
            summary: '高置信命中 OFAC 模拟清单，硬拦截',
          },
        }),
      },
    },
  });
  const party = await prisma.party.findFirst({ where: { caseId: c.id, role: 'BUYER' } });
  await prisma.screeningHit.create({
    data: {
      caseId: c.id,
      partyId: party!.id,
      listCode: 'OFAC',
      listedName: 'BANNED TRADING LLC',
      matchedName: buyer,
      confidence: 'HIGH',
      riskLevel: 'HIGH',
      disposition: 'OPEN',
      score: 98,
      rawJson: JSON.stringify({ source: 'mock-blacklist', note: '精确命中' }),
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      score: 98,
      riskLevel: 'HIGH',
      summary: '高置信命中 OFAC（模拟）BANNED TRADING LLC，硬拦截，禁止进入后续交易节点。',
      payload: JSON.stringify({ hits: 1, decision: 'HARD_BLOCK' }),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        caseId: c.id,
        actorId: salesId,
        action: 'CASE_CREATED',
        nodeCode: 'N1',
        detail: JSON.stringify({ scenario: 'HARD_BLOCK' }),
      },
      {
        caseId: c.id,
        actorId: complianceId,
        action: 'KYC_SCREENED',
        nodeCode: 'N1',
        detail: JSON.stringify({ decision: 'HARD_BLOCK', score: 98 }),
      },
      {
        caseId: c.id,
        actorId: complianceId,
        action: 'GATE_REFUSED',
        nodeCode: 'N1',
        detail: JSON.stringify({ missing: ['N1_HIGH_CONFIDENCE_HIT'] }),
      },
    ],
  });
  return c;
}

async function seedGateDemoCase(salesId: string) {
  const fields = {
    buyerName: 'Harbor View Ltd',
    consigneeName: 'Harbor View Ltd',
    goodsDesc: '工业泵',
    amountFen: 5400000,
    currency: 'USD',
    incoterms: 'FOB',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-GATE',
      title: '闽南泵业出口 Harbor View（硬闸门缺证据演示）',
      scenario: 'GATE_DEMO',
      status: 'IN_PROGRESS',
      currentNode: 'N6',
      overallRisk: 'LOW',
      goodsDesc: '工业泵',
      destination: 'Singapore',
      amountFen: 5400000,
      parties: {
        create: [
          { role: 'BUYER', name: 'Harbor View Ltd', country: 'SG', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Harbor View Ltd', country: 'SG', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Harbor View Ltd', country: 'SG', isSameAsBuyer: true },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
          N3: { status: 'PASSED', decision: 'PASS', summary: '合同条款齐全' },
          N6: { status: 'IN_PROGRESS', decision: null, summary: '待补客户书面指示、内部审批、提单控制' },
        }),
      },
      contract: {
        create: {
          counterparty: 'Harbor View Ltd',
          paymentTerms: 'T/T 15 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: false,
          ...fields,
          destination: 'Singapore',
        },
      },
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      score: 0,
      riskLevel: 'LOW',
      summary: '未命中模拟清单。',
      payload: JSON.stringify({ hits: [] }),
    },
  });
  await prisma.auditLog.create({
    data: {
      caseId: c.id,
      actorId: salesId,
      action: 'CASE_CREATED',
      nodeCode: 'N1',
      detail: JSON.stringify({ scenario: 'GATE_DEMO' }),
    },
  });
  return c;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
