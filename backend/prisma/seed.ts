import { PrismaClient } from '@prisma/client';
import { NODE_CATALOG } from '../src/common/constants';
import { enrollBuyerForCase } from '../src/customers/customer-enroll';
import { derivePaymentDueAt } from '../src/customers/remittance';
import { PaymentMode, resolveSchedule, rollupPaymentFields } from '../src/suppliers/payment-schedule';

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

const HS = [
  {
    hsCode: '8458.11.00',
    productName: '数控机床配件',
    requiredElementsJson: JSON.stringify(['品牌', '型号', '用途', '是否数控', '加工材料']),
    unit: '千克',
    exportTaxName: '加工中心用零件',
  },
  {
    hsCode: '8205.40.00',
    productName: '手工具套装',
    requiredElementsJson: JSON.stringify(['品牌', '材质', '规格', '用途']),
    unit: '套',
    exportTaxName: '手工工具',
  },
  {
    hsCode: '8413.70.00',
    productName: '工业泵',
    requiredElementsJson: JSON.stringify(['品牌', '型号', '扬程', '介质']),
    unit: '台',
    exportTaxName: '离心泵',
  },
  {
    hsCode: '8708.30.00',
    productName: '汽车制动组件',
    requiredElementsJson: JSON.stringify(['品牌', '适用车型', '材质']),
    unit: '千克',
    exportTaxName: '制动器零件',
  },
];

function goodsKey(desc: string) {
  return desc.replace(/\s+/g, '').toLowerCase();
}

function paymentSchedule(
  planAmountFen: number,
  items: Array<{
    label?: string;
    percent?: number;
    conditionText?: string;
    dueAt?: Date;
    paidFen?: number;
    paidAt?: Date;
  }>,
) {
  const resolved = resolveSchedule(planAmountFen, items);
  const rollup = rollupPaymentFields(resolved);
  return {
    paymentMode: resolved.length > 1 ? PaymentMode.STAGED : PaymentMode.FULL,
    paidFen: rollup.paidFen,
    paymentDueAt: rollup.paymentDueAt,
    paidAt: rollup.paidAt,
    installments: {
      create: resolved.map((item) => ({
        seq: item.seq,
        label: item.label,
        percentBps: item.percentBps,
        amountFen: item.amountFen,
        conditionText: item.conditionText,
        dueAt: item.dueAt ? new Date(item.dueAt) : null,
        paidFen: item.paidFen,
        paidAt: item.paidAt ? new Date(item.paidAt) : null,
      })),
    },
  };
}

async function main() {
  await prisma.changeDiff.deleteMany();
  await prisma.sinosurePolicy.deleteMany();
  await prisma.changeOrder.deleteMany();
  await prisma.contractVersion.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.procurementPaymentInstallment.deleteMany();
  await prisma.procurementPlan.deleteMany();
  await prisma.customsDeclaration.deleteMany();
  await prisma.evidence.deleteMany();
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
  await prisma.supplier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.caseNode.deleteMany();
  await prisma.tradeCase.deleteMany();
  await prisma.blacklistEntry.deleteMany();
  await prisma.costFloor.deleteMany();
  await prisma.historicalPrice.deleteMany();
  await prisma.hsTemplate.deleteMany();
  await prisma.user.deleteMany();

  const [sales, compliance, approver, finance] = await Promise.all([
    prisma.user.create({ data: { name: '王磊', role: 'SALES' } }),
    prisma.user.create({ data: { name: '陈可', role: 'COMPLIANCE' } }),
    prisma.user.create({ data: { name: '赵衡', role: 'APPROVER' } }),
    prisma.user.create({ data: { name: '孙琪', role: 'FINANCE' } }),
  ]);
  void finance;

  await prisma.blacklistEntry.createMany({ data: LISTS });
  await prisma.hsTemplate.createMany({ data: HS });
  await prisma.costFloor.createMany({
    data: [
      { goodsKey: goodsKey('数控机床配件'), goodsDesc: '数控机床配件', floorFen: 1000000 },
      { goodsKey: goodsKey('手工具套装'), goodsDesc: '手工具套装', floorFen: 250000 },
      { goodsKey: goodsKey('工业泵'), goodsDesc: '工业泵', floorFen: 400000 },
      { goodsKey: goodsKey('汽车制动组件'), goodsDesc: '汽车制动组件', floorFen: 500000 },
    ],
  });
  await prisma.historicalPrice.createMany({
    data: [
      { goodsKey: goodsKey('数控机床配件'), counterparty: 'Nordlicht GmbH', unitPriceFen: 1200000, quotedAt: new Date('2025-11-01') },
      { goodsKey: goodsKey('数控机床配件'), counterparty: 'Rhein Parts', unitPriceFen: 1300000, quotedAt: new Date('2026-03-15') },
      { goodsKey: goodsKey('数控机床配件'), counterparty: 'Hansa Tech', unitPriceFen: 1250000, quotedAt: new Date('2026-06-20') },
      { goodsKey: goodsKey('手工具套装'), counterparty: 'Acme Industrial Co', unitPriceFen: 320000, quotedAt: new Date('2026-01-10') },
      { goodsKey: goodsKey('工业泵'), counterparty: 'Harbor View Ltd', unitPriceFen: 520000, quotedAt: new Date('2026-02-02') },
    ],
  });

  const pass = await seedPassCase(sales.id, approver.id, compliance.id);
  const nordLate = await seedNordlichtLateCase(sales.id, approver.id);
  const nordOpen = await seedNordlichtOpenCase(sales.id, approver.id);
  const soft = await seedSoftCase(sales.id, compliance.id);
  const block = await seedBlockCase(sales.id, compliance.id);
  const gate = await seedGateDemoCase(sales.id);
  const fob = await seedFobNoBlCase(sales.id, approver.id);
  const limit = await seedSinosureOverLimitCase(sales.id);
  const supplierBlock = await seedSupplierBlockCase(sales.id);

  await attachBuyersToCustomers();
  await attachSuppliers();
  await fillPaymentDueDates();

  const customerCount = await prisma.customer.count();
  const enrolledBuyers = await prisma.party.count({ where: { role: 'BUYER', customerId: { not: null } } });

  console.log('种子数据已写入：');
  console.log('  PASS      ', pass.caseNo, pass.id);
  console.log('  NORD_LATE ', nordLate.caseNo, nordLate.id, '（Nordlicht 逾期收汇）');
  console.log('  NORD_OPEN ', nordOpen.caseNo, nordOpen.id, '（Nordlicht 收汇未到期）');
  console.log('  SOFT_ALERT', soft.caseNo, soft.id);
  console.log('  HARD_BLOCK', block.caseNo, block.id);
  console.log('  GATE_DEMO ', gate.caseNo, gate.id, '（N6 缺证据，用于闸门拒绝演示）');
  console.log('  FOB_NO_BL ', fob.caseNo, fob.id, '（FOB 无提单路径已过 N6）');
  console.log('  SINOSURE  ', limit.caseNo, limit.id, '（合同金额超过中信保限额，N3 拒绝）');
  console.log('  SUPPLIER  ', supplierBlock.caseNo, supplierBlock.id, '（国内供应商命中不可靠实体，N5 硬拦截）');
  console.log(`客户管理：${customerCount} 个客户，${enrolledBuyers} 个已达 N3 的买方已挂档（询盘未达 N3 的如 DEMO-BLOCK 不录入）`);
}

function nodeCreates(overrides: Record<string, Partial<{ status: string; decision: string | null; summary: string }>>) {
  return NODE_CATALOG.map((n) => ({
    code: n.code,
    name: n.name,
    isStub: false,
    isHardGate: n.isHardGate,
    status: overrides[n.code]?.status ?? 'NOT_STARTED',
    decision: overrides[n.code]?.decision ?? null,
    summary: overrides[n.code]?.summary ?? n.summary,
    completedAt: overrides[n.code]?.status === 'PASSED' ? new Date() : null,
  }));
}

async function attachClearSupplierScreen(caseId: string, supplierName: string) {
  await prisma.kycReport.create({
    data: {
      caseId,
      nodeCode: 'N5',
      score: 0,
      riskLevel: 'LOW',
      summary: '国内供应商未命中 OFAC/UN/EU/UK 及中国不可靠实体清单（模拟库）。',
      payload: JSON.stringify({
        parties: [{ role: 'SUPPLIER', name: supplierName }],
        hits: [],
        lists: ['OFAC', 'UN', 'EU', 'UK', 'CN_UNRELIABLE'],
        disclaimer: 'mock',
      }),
    },
  });
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
  const quoteSnap = {
    version: 2,
    priceBasis: 'MIXED',
    includedItems: '海运费、出口报关费',
    excludedItems: '目的港关税与增值税',
    validityUntil: '2026-12-31',
    freightBearer: 'SELLER',
    taxBearer: 'BUYER',
    unitPriceFen: 1280000,
    quantity: 10,
    amountFen: 12800000,
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
          {
            role: 'SUPPLIER',
            name: '苏州精工机械有限公司',
            country: 'CN',
            registrationNo: '91320500MA1BHTEST',
            address: '江苏省苏州市工业园区',
            isSameAsBuyer: false,
          },
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
          deliveryDate: new Date('2026-11-30'),
          quantity: 10,
          unit: '套',
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
          receivedAt: new Date('2026-09-10T00:00:00.000Z'),
        },
      },
      kycReports: {
        create: {
          nodeCode: 'N1',
          score: 0,
          riskLevel: 'LOW',
          summary: '未命中 OFAC/UN/EU/UK 及中国不可靠实体清单（模拟库）。',
          payload: JSON.stringify({ hits: [], disclaimer: 'mock' }),
        },
      },
      quotes: {
        create: [
          {
            version: 1,
            status: 'SUPERSEDED',
            priceBasis: 'MIXED',
            includedItems: '海运费',
            excludedItems: '关税',
            validityUntil: new Date('2026-10-01'),
            freightBearer: 'SELLER',
            taxBearer: 'BUYER',
            unitPriceFen: 1280000,
            quantity: 8,
            amountFen: 10240000,
            snapshotJson: JSON.stringify({ version: 1, quantity: 8, superseded: true }),
          },
          {
            version: 2,
            status: 'ACTIVE',
            priceBasis: 'MIXED',
            includedItems: '海运费、出口报关费',
            excludedItems: '目的港关税与增值税',
            validityUntil: new Date('2026-12-31'),
            freightBearer: 'SELLER',
            taxBearer: 'BUYER',
            unitPriceFen: 1280000,
            quantity: 10,
            amountFen: 12800000,
            snapshotJson: JSON.stringify(quoteSnap),
          },
        ],
      },
      procurementPlan: {
        create: {
          poNo: 'PO-BH-2026-011',
          plannedArrival: new Date('2026-11-28'),
          contractDelivery: new Date('2026-11-30'),
          actualArrival: new Date('2026-11-25'),
          poEvidenceStub: 'PO-BH-2026-011.pdf',
          delayRegistered: false,
          amountFen: 82000000,
          currency: 'CNY',
          ...paymentSchedule(82000000, [
            {
              percent: 100,
              label: '一次性付清',
              conditionText: '一次性付清',
              dueAt: new Date('2026-09-01T00:00:00.000Z'),
              paidFen: 82000000,
              paidAt: new Date('2026-08-20T00:00:00.000Z'),
            },
          ]),
        },
      },
      customs: {
        create: {
          hsCode: '8458.11.00',
          productName: '数控机床配件',
          declareElementsJson: JSON.stringify({
            品牌: 'Beihai',
            型号: 'BH-200',
            用途: '金属切削',
            是否数控: '是',
            加工材料: '铸铁',
          }),
          originCountry: 'CN',
          originEvidenceType: 'CO',
          originEvidenceRef: 'CO-2026-011',
          unit: '千克',
          exportTaxName: '加工中心用零件',
          eportStatus: 'RELEASED',
          eportSyncRef: 'EPORT-RLS-DEMO',
          eportSyncedAt: new Date(),
        },
      },
    },
  });

  const evCustomer = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N4',
      kind: 'CUSTOMER_ACK',
      ref: 'MAIL-NL-QTY',
      note: '客户确认数量 8→10',
      payload: JSON.stringify({ changeNo: 'CO-001' }),
    },
  });
  const evInternal = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N4',
      kind: 'INTERNAL_ACK',
      ref: 'OA-NL-QTY',
      note: '内部确认数量变更',
      payload: JSON.stringify({ changeNo: 'CO-001' }),
    },
  });
  await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N5',
      kind: 'PROCUREMENT_PO',
      ref: 'PO-BH-2026-011',
      note: 'PO-BH-2026-011.pdf',
      payload: JSON.stringify({ poNo: 'PO-BH-2026-011', fileName: 'PO-BH-2026-011.pdf' }),
    },
  });
  await attachClearSupplierScreen(c.id, '苏州精工机械有限公司');
  await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N8',
      kind: 'ORIGIN_CERT',
      ref: 'CO-2026-011',
      note: 'CO',
      payload: JSON.stringify({ originCountry: 'CN' }),
    },
  });
  const evSinosureN3 = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-NL-2026',
      note: '中信保保单/限额批注',
      payload: JSON.stringify({ insuredLimitFen: 15000000, currency: 'USD' }),
    },
  });
  const evSinosureN4 = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N4',
      kind: 'SINOSURE_CONFIRM',
      ref: 'SIN-NL-2026',
      note: '确认沿用当前中信保保单',
      payload: JSON.stringify({ insuredLimitFen: 15000000, currency: 'USD', confirmedExisting: true }),
    },
  });

  const change = await prisma.changeOrder.create({
    data: {
      caseId: c.id,
      changeNo: 'CO-001',
      version: 1,
      status: 'APPLIED',
      reason: '客户追加两套备件',
      isSensitive: false,
      customerAck: true,
      customerAckRef: 'MAIL-NL-QTY',
      customerAckEvidenceId: evCustomer.id,
      customerAckedAt: new Date(),
      internalAck: true,
      internalAckEvidenceId: evInternal.id,
      internalAckedAt: new Date(),
      appliedAt: new Date(),
      diffs: {
        create: [{ field: 'quantity', fieldLabel: '数量', oldValue: '8', newValue: '10' }],
      },
    },
  });
  await prisma.contractVersion.createMany({
    data: [
      {
        caseId: c.id,
        version: 1,
        status: 'SUPERSEDED',
        snapshotJson: JSON.stringify({ ...fields, quantity: 8, deliveryDate: '2026-11-30' }),
      },
      {
        caseId: c.id,
        version: 2,
        status: 'ACTIVE',
        changeOrderId: change.id,
        snapshotJson: JSON.stringify({ ...fields, quantity: 10, deliveryDate: '2026-11-30' }),
      },
    ],
  });
  await prisma.sinosurePolicy.createMany({
    data: [
      {
        caseId: c.id,
        nodeCode: 'N3',
        evidenceId: evSinosureN3.id,
        evidenceRef: 'SIN-NL-2026',
        fileName: '中信保限额批注-Nordlicht.pdf',
        insuredLimitFen: 15000000,
        currency: 'USD',
        confirmedExisting: false,
      },
      {
        caseId: c.id,
        nodeCode: 'N4',
        changeOrderId: change.id,
        evidenceId: evSinosureN4.id,
        evidenceRef: 'SIN-NL-2026',
        fileName: '中信保限额批注-Nordlicht.pdf',
        insuredLimitFen: 15000000,
        currency: 'USD',
        confirmedExisting: true,
      },
    ],
  });
  await prisma.auditLog.createMany({
    data: [
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N1', detail: JSON.stringify({ scenario: 'PASS' }) },
      { caseId: c.id, actorId: complianceId, action: 'KYC_SCREENED', nodeCode: 'N1', detail: JSON.stringify({ score: 0, riskLevel: 'LOW' }) },
      { caseId: c.id, actorId: salesId, action: 'QUOTE_VERSION_SAVED', nodeCode: 'N2', detail: JSON.stringify({ version: 2 }) },
      { caseId: c.id, actorId: salesId, action: 'CHANGE_ORDER_APPLIED', nodeCode: 'N4', detail: JSON.stringify({ changeNo: 'CO-001', diffs: [{ field: 'quantity' }] }) },
      { caseId: c.id, actorId: salesId, action: 'NODE_ADVANCED', nodeCode: 'N9', detail: JSON.stringify({ decision: 'PASS' }) },
    ],
  });
  return c;
}

function passNodes() {
  return {
    N1: { status: 'PASSED', decision: 'PASS', summary: '当事方齐全，筛查未命中' },
    N2: { status: 'PASSED', decision: 'PASS', summary: '报价 v2 价格基础/有效期/承担方齐全' },
    N3: { status: 'PASSED', decision: 'PASS', summary: '条款齐全，中信保限额覆盖合同金额' },
    N4: { status: 'PASSED', decision: 'PASS', summary: 'CO-001 数量 8→10，客户与内部确认后生效；变更后再次核对中信保限额' },
    N5: { status: 'PASSED', decision: 'PASS', summary: '苏州精工机械计划到货 2026-11-28，不晚于合同交期；供应商筛查未命中' },
    N6: { status: 'PASSED', decision: 'PASS', summary: '书面指示、内部审批、正本提单（与电放二选一）齐全' },
    N7: { status: 'PASSED', decision: 'PASS', summary: '终稿合同与单证字段一致' },
    N8: { status: 'PASSED', decision: 'PASS', summary: 'HS 8458.11.00 申报要素与原产地证齐全，电子口岸已放行' },
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
          N2: {
            status: 'PASSED',
            decision: 'SOFT_ALERT',
            summary: '单价较历史均价略有偏离，软提示；报价要素齐全',
          },
        }),
      },
      quotes: {
        create: {
          version: 1,
          status: 'ACTIVE',
          priceBasis: 'EXCLUSIVE',
          excludedItems: '海运费、保险、目的港费用',
          validityUntil: new Date('2026-12-15'),
          freightBearer: 'BUYER',
          taxBearer: 'BUYER',
          unitPriceFen: 360000,
          quantity: 10,
          amountFen: 3600000,
          snapshotJson: JSON.stringify({ version: 1, unitPriceFen: 360000, priceBasis: 'EXCLUSIVE' }),
        },
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
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N1', detail: JSON.stringify({ scenario: 'SOFT_ALERT' }) },
      { caseId: c.id, actorId: complianceId, action: 'KYC_SCREENED', nodeCode: 'N1', detail: JSON.stringify({ decision: 'SOFT_ALERT', score: 28 }) },
      { caseId: c.id, actorId: salesId, action: 'QUOTE_VERSION_SAVED', nodeCode: 'N2', detail: JSON.stringify({ version: 1 }) },
      { caseId: c.id, actorId: salesId, action: 'NODE_ADVANCED', nodeCode: 'N2', detail: JSON.stringify({ canProceed: true, decision: 'SOFT_ALERT' }) },
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
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N1', detail: JSON.stringify({ scenario: 'HARD_BLOCK' }) },
      { caseId: c.id, actorId: complianceId, action: 'KYC_SCREENED', nodeCode: 'N1', detail: JSON.stringify({ decision: 'HARD_BLOCK', score: 98 }) },
      { caseId: c.id, actorId: complianceId, action: 'GATE_REFUSED', nodeCode: 'N1', detail: JSON.stringify({ missing: ['N1_HIGH_CONFIDENCE_HIT'] }) },
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
          {
            role: 'SUPPLIER',
            name: '温州泵阀制造有限公司',
            country: 'CN',
            registrationNo: '91330300MA2GATE01',
            isSameAsBuyer: false,
          },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
          N3: { status: 'PASSED', decision: 'PASS', summary: '合同条款齐全，中信保限额覆盖合同金额' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更，已跳过变更管理' },
          N5: { status: 'PASSED', decision: 'PASS', summary: '采购计划到货不晚于合同交期；供应商筛查未命中' },
          N6: { status: 'IN_PROGRESS', decision: null, summary: '待补客户书面指示、内部审批；FOB 须走无提单路径或仍选正本/电放' },
        }),
      },
      contract: {
        create: {
          counterparty: 'Harbor View Ltd',
          paymentTerms: 'T/T 15 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: false,
          deliveryDate: new Date('2026-12-15'),
          quantity: 6,
          unit: '台',
          ...fields,
          destination: 'Singapore',
        },
      },
      quotes: {
        create: {
          version: 1,
          status: 'ACTIVE',
          priceBasis: 'EXCLUSIVE',
          excludedItems: '海运费、保险',
          validityUntil: new Date('2026-12-31'),
          freightBearer: 'BUYER',
          taxBearer: 'BUYER',
          unitPriceFen: 900000,
          quantity: 6,
          amountFen: 5400000,
          snapshotJson: JSON.stringify({ version: 1, priceBasis: 'EXCLUSIVE' }),
        },
      },
      procurementPlan: {
        create: {
          poNo: 'PO-HV-2026-088',
          plannedArrival: new Date('2026-12-10'),
          contractDelivery: new Date('2026-12-15'),
          poEvidenceStub: 'PO-HV-2026-088.pdf',
          delayRegistered: false,
          amountFen: 35000000,
          currency: 'CNY',
          ...paymentSchedule(35000000, [
            {
              percent: 100,
              label: '一次性付清',
              conditionText: '一次性付清',
              dueAt: new Date('2026-12-31T00:00:00.000Z'),
              paidFen: 0,
            },
          ]),
        },
      },
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      nodeCode: 'N1',
      score: 0,
      riskLevel: 'LOW',
      summary: '未命中模拟清单。',
      payload: JSON.stringify({ hits: [] }),
    },
  });
  await attachClearSupplierScreen(c.id, '温州泵阀制造有限公司');
  const evSin = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-HV-2026',
      note: '中信保保单/限额批注',
      payload: JSON.stringify({ insuredLimitFen: 8000000, currency: 'USD' }),
    },
  });
  await prisma.sinosurePolicy.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      evidenceId: evSin.id,
      evidenceRef: 'SIN-HV-2026',
      fileName: '中信保限额批注-HarborView.pdf',
      insuredLimitFen: 8000000,
      currency: 'USD',
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

async function seedFobNoBlCase(salesId: string, approverId: string) {
  const fields = {
    buyerName: 'Pacific Tools Pte Ltd',
    consigneeName: 'Pacific Tools Pte Ltd',
    goodsDesc: '手工具套装',
    amountFen: 3600000,
    currency: 'USD',
    incoterms: 'FOB',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-FOB',
      title: '沪上五金 FOB 出口 Pacific Tools（无提单路径通过）',
      scenario: 'FOB_NO_BL',
      status: 'IN_PROGRESS',
      currentNode: 'N7',
      overallRisk: 'LOW',
      goodsDesc: '手工具套装',
      destination: 'Singapore',
      amountFen: 3600000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: 'Pacific Tools Pte Ltd', country: 'SG', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Pacific Tools Pte Ltd', country: 'SG', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Pacific Tools Pte Ltd', country: 'SG', isSameAsBuyer: true },
          {
            role: 'SUPPLIER',
            name: '宁波五金制品有限公司',
            country: 'CN',
            registrationNo: '91330200MA2FOB001',
            isSameAsBuyer: false,
          },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '当事方齐全，筛查未命中' },
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全，运费由买方承担' },
          N3: { status: 'PASSED', decision: 'PASS', summary: 'FOB，条款与中信保限额齐全' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
          N5: { status: 'PASSED', decision: 'PASS', summary: '采购计划到货不晚于合同交期；供应商筛查未命中' },
          N6: {
            status: 'PASSED',
            decision: 'PASS',
            summary: '书面指示、内部审批、无提单路径（FOB 买方订舱）依据齐全',
          },
        }),
      },
      contract: {
        create: {
          counterparty: 'Pacific Tools Pte Ltd',
          paymentTerms: 'T/T 15 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: true,
          deliveryDate: new Date('2026-12-20'),
          quantity: 10,
          unit: '套',
          ...fields,
          destination: 'Singapore',
        },
      },
      shipment: {
        create: {
          hasCustomerWrittenInstruction: true,
          instructionRef: 'INST-FOB-PT-2026-004',
          hasInternalApproval: true,
          approverId,
          blControl: 'NO_BL',
          blNo: null,
          noBlReason: 'FOB 买方指定货代自行订舱，卖方不签发、不控提单',
          noBlRef: 'SA-FOB-2026-004',
          noBlEvidenceStub: 'DEMO-SA-FOB-004.pdf',
        },
      },
      quotes: {
        create: {
          version: 1,
          status: 'ACTIVE',
          priceBasis: 'EXCLUSIVE',
          excludedItems: '海运费、保险、目的港费用',
          validityUntil: new Date('2026-12-31'),
          freightBearer: 'BUYER',
          taxBearer: 'BUYER',
          unitPriceFen: 360000,
          quantity: 10,
          amountFen: 3600000,
          snapshotJson: JSON.stringify({ version: 1, priceBasis: 'EXCLUSIVE', incoterms: 'FOB' }),
        },
      },
      procurementPlan: {
        create: {
          poNo: 'PO-PT-FOB-004',
          plannedArrival: new Date('2026-12-15'),
          contractDelivery: new Date('2026-12-20'),
          poEvidenceStub: 'PO-PT-FOB-004.pdf',
          delayRegistered: false,
          amountFen: 21000000,
          currency: 'CNY',
          ...paymentSchedule(21000000, [
            {
              percent: 100,
              label: '一次性付清',
              conditionText: '一次性付清',
              dueAt: new Date('2026-12-01T00:00:00.000Z'),
              paidFen: 21000000,
              paidAt: new Date('2026-09-01T00:00:00.000Z'),
            },
          ]),
        },
      },
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      nodeCode: 'N1',
      score: 0,
      riskLevel: 'LOW',
      summary: '未命中模拟清单。',
      payload: JSON.stringify({ hits: [] }),
    },
  });
  await attachClearSupplierScreen(c.id, '宁波五金制品有限公司');
  const evSin = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-PT-FOB',
      note: '中信保保单/限额批注',
      payload: JSON.stringify({ insuredLimitFen: 5000000, currency: 'USD' }),
    },
  });
  await prisma.sinosurePolicy.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      evidenceId: evSin.id,
      evidenceRef: 'SIN-PT-FOB',
      fileName: '中信保限额批注-PacificTools.pdf',
      insuredLimitFen: 5000000,
      currency: 'USD',
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N1', detail: JSON.stringify({ scenario: 'FOB_NO_BL' }) },
      { caseId: c.id, actorId: salesId, action: 'SHIPMENT_SAVED', nodeCode: 'N6', detail: JSON.stringify({ blControl: 'NO_BL', noBlRef: 'SA-FOB-2026-004' }) },
      { caseId: c.id, actorId: salesId, action: 'NODE_ADVANCED', nodeCode: 'N6', detail: JSON.stringify({ decision: 'PASS', nextNode: 'N7' }) },
    ],
  });
  return c;
}

async function seedSinosureOverLimitCase(salesId: string) {
  const fields = {
    buyerName: 'Pacific Gear Ltd',
    consigneeName: 'Pacific Gear Ltd',
    goodsDesc: '工业泵',
    amountFen: 8000000,
    currency: 'USD',
    incoterms: 'CIF',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-LIMIT',
      title: '闽南泵业出口 Pacific Gear（中信保限额不足）',
      scenario: 'SINOSURE_OVER_LIMIT',
      status: 'IN_PROGRESS',
      currentNode: 'N3',
      overallRisk: 'LOW',
      goodsDesc: '工业泵',
      destination: 'Melbourne, AU',
      amountFen: 8000000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: 'Pacific Gear Ltd', country: 'AU', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Pacific Gear Ltd', country: 'AU', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Pacific Gear Ltd', country: 'AU', isSameAsBuyer: true },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
          N3: {
            status: 'IN_PROGRESS',
            decision: null,
            summary: '合同已填，中信保限额低于合同金额，推进将被拒绝',
          },
        }),
      },
      contract: {
        create: {
          counterparty: 'Pacific Gear Ltd',
          paymentTerms: 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: false,
          deliveryDate: new Date('2026-12-20'),
          quantity: 10,
          unit: '台',
          ...fields,
          destination: 'Melbourne, AU',
        },
      },
      quotes: {
        create: {
          version: 1,
          status: 'ACTIVE',
          priceBasis: 'EXCLUSIVE',
          excludedItems: '海运费、保险',
          validityUntil: new Date('2026-12-31'),
          freightBearer: 'BUYER',
          taxBearer: 'BUYER',
          unitPriceFen: 800000,
          quantity: 10,
          amountFen: 8000000,
          snapshotJson: JSON.stringify({ version: 1, priceBasis: 'EXCLUSIVE', amountFen: 8000000 }),
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
  const evSin = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-PG-LOW',
      note: '中信保保单/限额批注（限额不足演示）',
      payload: JSON.stringify({ insuredLimitFen: 3000000, currency: 'USD' }),
    },
  });
  await prisma.sinosurePolicy.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      evidenceId: evSin.id,
      evidenceRef: 'SIN-PG-LOW',
      fileName: '中信保限额批注-PacificGear.pdf',
      insuredLimitFen: 3000000,
      currency: 'USD',
    },
  });
  await prisma.auditLog.createMany({
    data: [
      {
        caseId: c.id,
        actorId: salesId,
        action: 'CASE_CREATED',
        nodeCode: 'N1',
        detail: JSON.stringify({ scenario: 'SINOSURE_OVER_LIMIT' }),
      },
      {
        caseId: c.id,
        actorId: salesId,
        action: 'SINOSURE_SAVED',
        nodeCode: 'N3',
        detail: JSON.stringify({ evidenceRef: 'SIN-PG-LOW', insuredLimitFen: 3000000, contractAmountFen: 8000000 }),
      },
    ],
  });
  return c;
}

async function seedSupplierBlockCase(salesId: string) {
  const supplierName = '某不可靠实体贸易有限公司';
  const fields = {
    buyerName: 'Rhein Parts GmbH',
    consigneeName: 'Rhein Parts GmbH',
    goodsDesc: '数控机床配件',
    amountFen: 9600000,
    currency: 'USD',
    incoterms: 'CIF',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-SUPPLIER',
      title: '北海机电国内采购命中不可靠实体（N5 硬拦截）',
      scenario: 'SUPPLIER_HARD_BLOCK',
      status: 'BLOCKED',
      currentNode: 'N5',
      overallRisk: 'HIGH',
      goodsDesc: '数控机床配件',
      destination: 'Hamburg, DE',
      amountFen: 9600000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: 'Rhein Parts GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Rhein Parts GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Rhein Parts GmbH', country: 'DE', isSameAsBuyer: true },
          {
            role: 'SUPPLIER',
            name: supplierName,
            country: 'CN',
            registrationNo: '91310000MA9BLOCK1',
            isSameAsBuyer: false,
          },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '国外买方筛查未命中' },
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
          N3: { status: 'PASSED', decision: 'PASS', summary: '合同条款与中信保限额齐全' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更，已跳过变更管理' },
          N5: {
            status: 'BLOCKED',
            decision: 'HARD_BLOCK',
            summary: '国内供应商高置信命中中国不可靠实体清单，硬拦截',
          },
        }),
      },
      contract: {
        create: {
          counterparty: 'Rhein Parts GmbH',
          paymentTerms: 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: true,
          deliveryDate: new Date('2026-12-10'),
          quantity: 8,
          unit: '套',
          ...fields,
          destination: 'Hamburg',
        },
      },
      quotes: {
        create: {
          version: 1,
          status: 'ACTIVE',
          priceBasis: 'EXCLUSIVE',
          excludedItems: '目的港关税',
          validityUntil: new Date('2026-12-31'),
          freightBearer: 'SELLER',
          taxBearer: 'BUYER',
          unitPriceFen: 1200000,
          quantity: 8,
          amountFen: 9600000,
          snapshotJson: JSON.stringify({ version: 1, priceBasis: 'EXCLUSIVE' }),
        },
      },
      procurementPlan: {
        create: {
          poNo: 'PO-UNREL-2026-001',
          plannedArrival: new Date('2026-12-05'),
          contractDelivery: new Date('2026-12-10'),
          poEvidenceStub: 'PO-UNREL-2026-001.pdf',
          delayRegistered: false,
          amountFen: 60000000,
          currency: 'CNY',
          ...paymentSchedule(60000000, [
            {
              percent: 100,
              label: '一次性付清',
              conditionText: '一次性付清',
              dueAt: new Date('2026-06-01T00:00:00.000Z'),
              paidFen: 0,
            },
          ]),
        },
      },
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      nodeCode: 'N1',
      score: 0,
      riskLevel: 'LOW',
      summary: '未命中模拟清单。',
      payload: JSON.stringify({ hits: [] }),
    },
  });
  const supplier = await prisma.party.findFirstOrThrow({ where: { caseId: c.id, role: 'SUPPLIER' } });
  const hit = await prisma.screeningHit.create({
    data: {
      caseId: c.id,
      partyId: supplier.id,
      nodeCode: 'N5',
      listCode: 'CN_UNRELIABLE',
      listedName: supplierName,
      matchedName: supplierName,
      confidence: 'HIGH',
      riskLevel: 'HIGH',
      disposition: 'OPEN',
      score: 96,
      rawJson: JSON.stringify({ source: 'mock-blacklist', partyRole: 'SUPPLIER', nodeCode: 'N5' }),
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      nodeCode: 'N5',
      score: 96,
      riskLevel: 'HIGH',
      summary: '国内供应商共 1 条命中，最高分 96，综合风险 HIGH。',
      payload: JSON.stringify({
        parties: [{ role: 'SUPPLIER', name: supplierName, country: 'CN' }],
        hits: [{ ...hit, partyRole: 'SUPPLIER' }],
        lists: ['OFAC', 'UN', 'EU', 'UK', 'CN_UNRELIABLE'],
        disclaimer: 'mock',
      }),
    },
  });
  const evSin = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-RP-2026',
      note: '中信保保单/限额批注',
      payload: JSON.stringify({ insuredLimitFen: 12000000, currency: 'USD' }),
    },
  });
  await prisma.sinosurePolicy.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      evidenceId: evSin.id,
      evidenceRef: 'SIN-RP-2026',
      fileName: '中信保限额批注-RheinParts.pdf',
      insuredLimitFen: 12000000,
      currency: 'USD',
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N1', detail: JSON.stringify({ scenario: 'SUPPLIER_HARD_BLOCK' }) },
      { caseId: c.id, actorId: salesId, action: 'SUPPLIER_SCREENED', nodeCode: 'N5', detail: JSON.stringify({ score: 96, riskLevel: 'HIGH', hitCount: 1 }) },
      { caseId: c.id, actorId: salesId, action: 'GATE_REFUSED', nodeCode: 'N5', detail: JSON.stringify({ missing: ['N5_HIGH_CONFIDENCE_HIT'] }) },
    ],
  });
  return c;
}

async function seedNordlichtLateCase(salesId: string, approverId: string) {
  const fields = {
    buyerName: 'Nordlicht GmbH',
    consigneeName: 'Nordlicht GmbH',
    goodsDesc: '数控机床配件',
    amountFen: 4500000,
    currency: 'USD',
    incoterms: 'CIF',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-NORD-LATE',
      title: '北海机电出口德国 Nordlicht（历史订单，逾期收汇）',
      scenario: 'OVERDUE_SETTLEMENT',
      status: 'COMPLETED',
      currentNode: 'N9',
      overallRisk: 'LOW',
      goodsDesc: '数控机床配件',
      destination: 'Hamburg, DE',
      amountFen: 4500000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          {
            role: 'SUPPLIER',
            name: '苏州精工机械有限公司',
            country: 'CN',
            registrationNo: '91320500MA1BHTEST',
            isSameAsBuyer: false,
          },
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
          deliveryDate: new Date('2026-03-15T00:00:00.000Z'),
          paymentDueAt: new Date('2026-04-14T00:00:00.000Z'),
          quantity: 4,
          unit: '套',
          ...fields,
          destination: 'Hamburg',
        },
      },
      shipment: {
        create: {
          hasCustomerWrittenInstruction: true,
          instructionRef: 'INST-NL-2026-003',
          hasInternalApproval: true,
          approverId,
          blControl: 'ORIGINAL',
          blNo: 'COSU7700112',
          vessel: 'COSCO SHIPPING',
          consigneeOnBl: 'Nordlicht GmbH',
        },
      },
      settlement: {
        create: {
          payerName: 'Nordlicht GmbH',
          buyerName: 'Nordlicht GmbH',
          isThirdParty: false,
          hasRemittanceMemo: true,
          remittanceMemoRef: 'SWIFT MT103 / INV-NL-003',
          hasDocConsistencyProof: true,
          hasReleaseApproval: true,
          amountFen: 2000000,
          receivedAt: new Date('2026-05-20T00:00:00.000Z'),
        },
      },
      procurementPlan: {
        create: {
          poNo: 'PO-BH-2026-003',
          plannedArrival: new Date('2026-03-10T00:00:00.000Z'),
          contractDelivery: new Date('2026-03-15T00:00:00.000Z'),
          actualArrival: new Date('2026-03-22T00:00:00.000Z'),
          poEvidenceStub: 'PO-BH-2026-003.pdf',
          delayRegistered: true,
          delayTriggerCode: 'CAPACITY',
          delayReason: '供应商交期不足，实际到货晚于计划',
          amountFen: 28000000,
          currency: 'CNY',
          ...paymentSchedule(28000000, [
            {
              percent: 90,
              label: '到货付款',
              conditionText: '货物到达交付地点之后支付',
              dueAt: new Date('2026-03-25T00:00:00.000Z'),
              paidFen: 25200000,
              paidAt: new Date('2026-05-10T00:00:00.000Z'),
            },
            {
              percent: 10,
              label: '尾款',
              conditionText: '验收合格并开具发票后支付',
              dueAt: new Date('2026-04-30T00:00:00.000Z'),
              paidFen: 0,
            },
          ]),
        },
      },
      kycReports: {
        create: {
          nodeCode: 'N1',
          score: 0,
          riskLevel: 'LOW',
          summary: '未命中模拟清单。',
          payload: JSON.stringify({ hits: [], disclaimer: 'mock' }),
        },
      },
    },
  });
  await attachClearSupplierScreen(c.id, '苏州精工机械有限公司');
  const evSin = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-NL-2026',
      note: '中信保保单/限额批注',
      payload: JSON.stringify({ insuredLimitFen: 15000000, currency: 'USD' }),
    },
  });
  await prisma.sinosurePolicy.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      evidenceId: evSin.id,
      evidenceRef: 'SIN-NL-2026',
      fileName: '中信保限额批注-Nordlicht.pdf',
      insuredLimitFen: 15000000,
      currency: 'USD',
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N1', detail: JSON.stringify({ scenario: 'OVERDUE_SETTLEMENT' }) },
      { caseId: c.id, actorId: salesId, action: 'NODE_ADVANCED', nodeCode: 'N9', detail: JSON.stringify({ decision: 'PASS', remittance: 'OVERDUE' }) },
    ],
  });
  return c;
}

async function seedNordlichtOpenCase(salesId: string, approverId: string) {
  const fields = {
    buyerName: 'Nordlicht GmbH',
    consigneeName: 'Nordlicht GmbH',
    goodsDesc: '数控机床配件',
    amountFen: 7200000,
    currency: 'USD',
    incoterms: 'CIF',
  };
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-NORD-OPEN',
      title: '北海机电出口德国 Nordlicht（在手订单，收汇未到期）',
      scenario: 'OPEN_SETTLEMENT',
      status: 'IN_PROGRESS',
      currentNode: 'N9',
      overallRisk: 'LOW',
      goodsDesc: '数控机床配件',
      destination: 'Hamburg, DE',
      amountFen: 7200000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'PAYER', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: 'Nordlicht GmbH', country: 'DE', isSameAsBuyer: true },
          {
            role: 'SUPPLIER',
            name: '苏州精工机械有限公司',
            country: 'CN',
            registrationNo: '91320500MA1BHTEST',
            isSameAsBuyer: false,
          },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '当事方齐全，筛查未命中' },
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
          N3: { status: 'PASSED', decision: 'PASS', summary: '条款齐全，中信保限额覆盖合同金额' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
          N5: { status: 'PASSED', decision: 'PASS', summary: '采购到货不晚于合同交期' },
          N6: { status: 'PASSED', decision: 'PASS', summary: '书面指示与正本提单齐全' },
          N7: { status: 'PASSED', decision: 'PASS', summary: '单证一致' },
          N8: { status: 'PASSED', decision: 'PASS', summary: '已报关放行，待收汇' },
          N9: { status: 'IN_PROGRESS', decision: null, summary: '约定收汇到期日未到，尚无到账记录' },
        }),
      },
      contract: {
        create: {
          counterparty: 'Nordlicht GmbH',
          paymentTerms: 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: true,
          deliveryDate: new Date('2026-12-01T00:00:00.000Z'),
          paymentDueAt: new Date('2026-12-31T00:00:00.000Z'),
          quantity: 6,
          unit: '套',
          ...fields,
          destination: 'Hamburg',
        },
      },
      shipment: {
        create: {
          hasCustomerWrittenInstruction: true,
          instructionRef: 'INST-NL-2026-019',
          hasInternalApproval: true,
          approverId,
          blControl: 'ORIGINAL',
          blNo: 'COSU9911223',
          vessel: 'EVER GOODS',
          consigneeOnBl: 'Nordlicht GmbH',
        },
      },
      procurementPlan: {
        create: {
          poNo: 'PO-BH-2026-019',
          plannedArrival: new Date('2026-11-20T00:00:00.000Z'),
          contractDelivery: new Date('2026-12-01T00:00:00.000Z'),
          poEvidenceStub: 'PO-BH-2026-019.pdf',
          delayRegistered: false,
          amountFen: 46000000,
          currency: 'CNY',
          ...paymentSchedule(46000000, [
            {
              percent: 100,
              label: '一次性付清',
              conditionText: '一次性付清',
              dueAt: new Date('2026-12-20T00:00:00.000Z'),
              paidFen: 0,
            },
          ]),
        },
      },
      kycReports: {
        create: {
          nodeCode: 'N1',
          score: 0,
          riskLevel: 'LOW',
          summary: '未命中模拟清单。',
          payload: JSON.stringify({ hits: [], disclaimer: 'mock' }),
        },
      },
    },
  });
  await attachClearSupplierScreen(c.id, '苏州精工机械有限公司');
  const evSin = await prisma.evidence.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      kind: 'SINOSURE_POLICY',
      ref: 'SIN-NL-2026',
      note: '中信保保单/限额批注',
      payload: JSON.stringify({ insuredLimitFen: 15000000, currency: 'USD' }),
    },
  });
  await prisma.sinosurePolicy.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      evidenceId: evSin.id,
      evidenceRef: 'SIN-NL-2026',
      fileName: '中信保限额批注-Nordlicht.pdf',
      insuredLimitFen: 15000000,
      currency: 'USD',
    },
  });
  await prisma.auditLog.create({
    data: {
      caseId: c.id,
      actorId: salesId,
      action: 'CASE_CREATED',
      nodeCode: 'N1',
      detail: JSON.stringify({ scenario: 'OPEN_SETTLEMENT' }),
    },
  });
  return c;
}

async function attachBuyersToCustomers() {
  const buyers = await prisma.party.findMany({ where: { role: 'BUYER' } });
  const seen = new Set<string>();
  for (const buyer of buyers) {
    if (seen.has(buyer.caseId)) continue;
    seen.add(buyer.caseId);
    await enrollBuyerForCase(prisma, buyer.caseId);
  }
}

async function attachSuppliers() {
  const rows = await prisma.party.findMany({ where: { role: 'SUPPLIER' } });
  for (const row of rows) {
    const supplier = await prisma.supplier.upsert({
      where: { name: row.name },
      create: {
        name: row.name,
        nameEn: row.nameEn,
        country: row.country,
        address: row.address,
        registrationNo: row.registrationNo,
      },
      update: {
        ...(row.country ? { country: row.country } : {}),
        ...(row.registrationNo ? { registrationNo: row.registrationNo } : {}),
      },
    });
    await prisma.party.update({
      where: { id: row.id },
      data: { supplierId: supplier.id },
    });
  }
}

async function fillPaymentDueDates() {
  const contracts = await prisma.contract.findMany();
  for (const row of contracts) {
    if (row.paymentDueAt) continue;
    const due = derivePaymentDueAt(row.deliveryDate, row.paymentTerms);
    if (!due) continue;
    await prisma.contract.update({ where: { id: row.id }, data: { paymentDueAt: due } });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
