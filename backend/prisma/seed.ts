import { PrismaClient } from '@prisma/client';
import { NODE_CATALOG } from '../src/common/constants';
import { enrollBuyerForCase } from '../src/customers/customer-enroll';
import { derivePaymentDueAt } from '../src/customers/remittance';
import { PaymentMode, resolveSchedule, rollupPaymentFields } from '../src/suppliers/payment-schedule';
import { OccupancyReviewStatus, occupancyFingerprint } from '../src/workbench/occupancy-review';
import {
  DeliveryMode,
  TaxFinanceReviewStatus,
  completeDirectPortFixture,
  stringifyDirectPort,
  taxFinanceFingerprint,
} from '../src/tax-finance/tax-finance';
import { describeDefaultBatch } from '../src/cases/shipment-batch';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}

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
    unit: 'TON',
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
  await prisma.occupancyReview.deleteMany();
  await prisma.taxFinanceReview.deleteMany();
  await prisma.taxRebateChecklist.deleteMany();
  await prisma.docMismatchFix.deleteMany();
  await prisma.tradeDocument.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.shipmentBatchNode.deleteMany();
  await prisma.shipmentBatch.deleteMany();
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

  const [sales, compliance, approver] = await Promise.all([
    prisma.user.create({ data: { name: '业务岗', role: 'SALES' } }),
    prisma.user.create({ data: { name: '风控', role: 'RISK' } }),
    prisma.user.create({ data: { name: '主管', role: 'MANAGER' } }),
  ]);

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
  const noLimit = await seedSinosureUnregisteredCase(sales.id);
  const nordWip = await seedNordlichtWipCase(sales.id);
  const helios = await seedHeliosMediumBundle(sales.id, approver.id);
  const high = await seedSinosureHighCase(sales.id);
  const supplierBlock = await seedSupplierBlockCase(sales.id);
  const portYellow = await seedDirectPortYellowCase(sales.id);
  const portRed = await seedDirectPortRedCase(sales.id);

  await ensureDemoBatches();
  await attachBuyersToCustomers();
  await attachSuppliers();
  await fillPaymentDueDates();
  const linkedPairs = await linkProcurementPlansToSalesCases();

  const customerCount = await prisma.customer.count();
  const enrolledBuyers = await prisma.party.count({ where: { role: 'BUYER', customerId: { not: null } } });

  console.log('种子数据已写入：');
  console.log('  PASS      ', pass.caseNo, pass.id);
  console.log('  NORD_LATE ', nordLate.caseNo, nordLate.id, '（Nordlicht 逾期收汇）');
  console.log('  NORD_OPEN ', nordOpen.caseNo, nordOpen.id, '（Nordlicht 收汇未到期）');
  console.log('  NORD_WIP  ', nordWip.caseNo, nordWip.id, '（Nordlicht 未履行完毕未回款）');
  console.log('  SOFT_ALERT', soft.caseNo, soft.id);
  console.log('  HARD_BLOCK', block.caseNo, block.id);
  console.log('  GATE_DEMO ', gate.caseNo, gate.id, '（N6 缺证据，用于闸门拒绝演示）');
  console.log('  FOB_NO_BL ', fob.caseNo, fob.id, '（FOB 无提单路径已过 N6）');
  console.log('  SINOSURE  ', limit.caseNo, limit.id, '（超额 50,000 USD 超高风险，N3 硬拦截）');
  console.log('  NOLIMIT   ', noLimit.caseNo, noLimit.id, '（中信保限额未登记，不得签订合同）');
  console.log('  LIMIT_MED ', helios.n3.caseNo, helios.n3.id, '（Helios 占用超额 13,000，中风险软提示）');
  console.log('  LIMIT_HIGH', high.caseNo, high.id, '（超额 25,000 USD 高风险，工作台领取/放行/驳回）');
  console.log('  SUPPLIER  ', supplierBlock.caseNo, supplierBlock.id, '（国内供应商命中不可靠实体，N5 硬拦截）');
  console.log('  PORT_YELLOW', portYellow.caseNo, portYellow.id, '（港口直出薄利黄灯，工作台第三页领取/通过/驳回）');
  console.log('  PORT_RED  ', portRed.caseNo, portRed.id, '（港口直出像空转，红线硬拦截）');
  console.log(`客户管理：${customerCount} 个客户，${enrolledBuyers} 个已达 N3 的买方已挂档（仍在报价 N2 的案件不录入；DEMO-BLOCK 已到 N3 但买方筛查硬拦截）`);
  console.log('采购合同 ↔ 销售合同（先销售后采购）：');
  for (const p of linkedPairs) {
    console.log(`  ${p.poNo || '（无 PO 号）'}  ←  ${p.salesCaseNo}（${p.customer}，${p.caseNo} 采购侧）`);
  }
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
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: true,
          deliveryDate: new Date('2026-11-30'),
          quantity: 10,
          unit: 'TON',
          ...fields,
          destination: 'Hamburg',
          shipmentPort: 'Shanghai',
          shipmentDate: new Date('2026-08-15T00:00:00.000Z'),
          etaDate: new Date('2026-09-20T00:00:00.000Z'),
          arrivalPort: 'Hamburg',
          customerPickedUp: true,
          paymentDueAt: new Date('2026-12-30T00:00:00.000Z'),
          hasRemittance: true,
          remittedFen: 12800000,
        },
      },
      shipments: {
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
      settlements: {
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
      nodeCode: 'N7',
      kind: 'N7_ORIGIN_CERT',
      ref: 'CO-2026-011',
      note: '原产地证（CIF 必填；报关放行页已取消）',
      payload: JSON.stringify({ originCountry: 'CN', fileName: '演示原产地证.pdf' }),
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
    N3: { status: 'PASSED', decision: 'PASS', summary: '销售合同条款齐全，中信保限额覆盖合同金额' },
    N4: { status: 'PASSED', decision: 'PASS', summary: 'CO-001 数量 8→10，客户与内部确认后生效；变更后再次核对中信保限额' },
    N5: { status: 'PASSED', decision: 'PASS', summary: '已关联本案件销售合同；苏州精工机械供应商实际交付日期不晚于合同交期；供应商筛查未命中' },
    N6: { status: 'PASSED', decision: 'PASS', summary: '书面指示、内部审批、正本提单（与电放二选一）齐全' },
    N7: { status: 'PASSED', decision: 'PASS', summary: '六份单证与原产地证已齐，进入收汇' },
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
      title: '华南汽配销售合同 Banned Trading（买方筛查硬拦截）',
      scenario: 'HARD_BLOCK',
      status: 'BLOCKED',
      currentNode: 'N3',
      overallRisk: 'HIGH',
      goodsDesc: '汽车制动组件',
      destination: 'Bandar Abbas',
      amountFen: 8800000,
      parties: {
        create: [
          { role: 'BUYER', name: buyer, country: 'IR', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: buyer, country: 'IR', isSameAsBuyer: true },
        ],
      },
      nodes: {
        create: nodeCreates({
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价已过，进入销售合同' },
          N3: {
            status: 'BLOCKED',
            decision: 'HARD_BLOCK',
            summary: '买方高置信命中 OFAC 模拟清单，销售合同不得推进',
          },
        }),
      },
      quotes: {
        create: {
          version: 1,
          status: 'ACTIVE',
          priceBasis: 'INCLUSIVE',
          includedItems: JSON.stringify(['OCEAN_FREIGHT']),
          validityUntil: new Date('2026-12-31'),
          unitPriceFen: 1100000,
          unit: 'TON',
          quantity: 8,
          amountFen: 8800000,
          goodsDesc: '汽车制动组件',
          snapshotJson: JSON.stringify({ version: 1, goodsDesc: '汽车制动组件' }),
        },
      },
    },
  });
  const party = await prisma.party.findFirst({ where: { caseId: c.id, role: 'BUYER' } });
  await prisma.screeningHit.create({
    data: {
      caseId: c.id,
      partyId: party!.id,
      nodeCode: 'N3',
      listCode: 'OFAC',
      listedName: 'BANNED TRADING LLC',
      matchedName: buyer,
      confidence: 'HIGH',
      riskLevel: 'HIGH',
      disposition: 'OPEN',
      score: 98,
      rawJson: JSON.stringify({ source: 'mock-blacklist', note: '精确命中', nodeCode: 'N3' }),
    },
  });
  await prisma.kycReport.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      score: 98,
      riskLevel: 'HIGH',
      summary: '高置信命中 OFAC（模拟）BANNED TRADING LLC，硬拦截，禁止推进销售合同。',
      payload: JSON.stringify({ hits: 1, decision: 'HARD_BLOCK' }),
    },
  });
  await prisma.auditLog.createMany({
    data: [
      { caseId: c.id, actorId: salesId, action: 'CASE_CREATED', nodeCode: 'N2', detail: JSON.stringify({ scenario: 'HARD_BLOCK' }) },
      { caseId: c.id, actorId: salesId, action: 'QUOTE_VERSION_SAVED', nodeCode: 'N2', detail: JSON.stringify({ version: 1 }) },
      { caseId: c.id, actorId: complianceId, action: 'KYC_SCREENED', nodeCode: 'N3', detail: JSON.stringify({ decision: 'HARD_BLOCK', score: 98 }) },
      { caseId: c.id, actorId: complianceId, action: 'GATE_REFUSED', nodeCode: 'N3', detail: JSON.stringify({ missing: ['N3_HIGH_CONFIDENCE_HIT'] }) },
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
          N3: { status: 'PASSED', decision: 'PASS', summary: '销售合同条款齐全，中信保限额覆盖合同金额' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更，已跳过变更管理' },
          N5: { status: 'PASSED', decision: 'PASS', summary: '已关联销售合同 DEMO-GATE；采购供应商实际交付日期不晚于合同交期；供应商筛查未命中' },
          N6: { status: 'IN_PROGRESS', decision: null, summary: '待上传发票与箱单、内部审批；FOB 须走无提单路径或仍选正本/电放' },
        }),
      },
      contract: {
        create: {
          counterparty: 'Harbor View Ltd',
          paymentTerms: 'OA 15 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: false,
          deliveryDate: new Date('2026-12-15'),
          quantity: 6,
          unit: 'TON',
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
          N3: { status: 'PASSED', decision: 'PASS', summary: 'FOB 销售合同，条款与中信保限额齐全' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
          N5: { status: 'PASSED', decision: 'PASS', summary: '已关联销售合同 DEMO-FOB；采购供应商实际交付日期不晚于合同交期；供应商筛查未命中' },
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
          paymentTerms: 'OA 15 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: true,
          deliveryDate: new Date('2026-12-20'),
          quantity: 10,
          unit: 'TON',
          ...fields,
          destination: 'Singapore',
          paymentDueAt: new Date('2027-01-04T00:00:00.000Z'),
          domesticPortArrivalAt: new Date('2026-12-08T10:00:00.000Z'),
          customerPickedUp: false,
          hasRemittance: false,
          remittedFen: 0,
        },
      },
      shipments: {
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
      documents: {
        create: ['CONTRACT', 'INVOICE', 'PACKING'].map((type) => ({
          type,
          isFinal: true,
          fieldsJson: JSON.stringify(fields),
        })),
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
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: false,
          deliveryDate: new Date('2026-12-20'),
          quantity: 10,
          unit: 'TON',
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

async function seedSinosureUnregisteredCase(salesId: string) {
  const buyer = 'Cedar Trade Ltd';
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: 'DEMO-NOLIMIT',
      title: '闽南工具出口 Cedar Trade（中信保限额未登记）',
      scenario: 'SINOSURE_UNREGISTERED',
      status: 'IN_PROGRESS',
      currentNode: 'N3',
      overallRisk: 'LOW',
      goodsDesc: '手工具套装',
      destination: 'Vancouver, CA',
      amountFen: 4200000,
      currency: 'USD',
      parties: {
        create: [
          { role: 'BUYER', name: buyer, country: 'CA', isSameAsBuyer: true },
          { role: 'PAYER', name: buyer, country: 'CA', isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: buyer, country: 'CA', isSameAsBuyer: true },
        ],
      },
      nodes: {
        create: nodeCreates({
          N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
          N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
          N3: {
            status: 'IN_PROGRESS',
            decision: null,
            summary: '尚未登记中信保限额，不得签订合同',
          },
        }),
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
          unitPriceFen: 420000,
          quantity: 10,
          amountFen: 4200000,
          snapshotJson: JSON.stringify({ version: 1, priceBasis: 'EXCLUSIVE', amountFen: 4200000 }),
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
  await prisma.auditLog.createMany({
    data: [
      {
        caseId: c.id,
        actorId: salesId,
        action: 'CASE_CREATED',
        nodeCode: 'N1',
        detail: JSON.stringify({ scenario: 'SINOSURE_UNREGISTERED' }),
      },
      {
        caseId: c.id,
        actorId: salesId,
        action: 'GATE_REFUSED',
        nodeCode: 'N3',
        detail: JSON.stringify({
          decision: 'HARD_BLOCK',
          canProceed: false,
          missing: ['N3_SINOSURE_LIMIT', 'N3_SINOSURE_EVIDENCE'],
          reasons: ['尚未登记中信保限额，不得签订合同'],
        }),
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
          N3: { status: 'PASSED', decision: 'PASS', summary: '销售合同条款与中信保限额齐全' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更，已跳过变更管理' },
          N5: {
            status: 'BLOCKED',
            decision: 'HARD_BLOCK',
            summary: '已关联销售合同 DEMO-SUPPLIER；国内供应商高置信命中中国不可靠实体清单，硬拦截',
          },
        }),
      },
      contract: {
        create: {
          counterparty: 'Rhein Parts GmbH',
          paymentTerms: 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: true,
          deliveryDate: new Date('2026-12-10'),
          quantity: 8,
          unit: 'TON',
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
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: true,
          deliveryDate: new Date('2026-03-15T00:00:00.000Z'),
          paymentDueAt: new Date('2026-04-14T00:00:00.000Z'),
          quantity: 4,
          unit: 'TON',
          ...fields,
          destination: 'Hamburg',
          shipmentPort: 'Ningbo',
          shipmentDate: new Date('2026-03-01T00:00:00.000Z'),
          etaDate: new Date('2026-03-28T00:00:00.000Z'),
          arrivalPort: 'Hamburg',
          customerPickedUp: true,
          hasRemittance: true,
          remittedFen: 2000000,
        },
      },
      shipments: {
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
      settlements: {
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
          delayReason: '供应商交期不足，实际交付日期晚于计划交付',
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
          N3: { status: 'PASSED', decision: 'PASS', summary: '销售合同条款齐全，中信保限额覆盖合同金额' },
          N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
          N5: { status: 'PASSED', decision: 'PASS', summary: '已关联销售合同 DEMO-NORD-OPEN；采购交付不晚于合同交期' },
          N6: { status: 'PASSED', decision: 'PASS', summary: '书面指示与正本提单齐全' },
          N7: { status: 'PASSED', decision: 'PASS', summary: '单证已齐（含原产地证），进入收汇' },
          N9: { status: 'IN_PROGRESS', decision: null, summary: '约定收汇到期日未到，尚无到账记录' },
        }),
      },
      contract: {
        create: {
          counterparty: 'Nordlicht GmbH',
          paymentTerms: 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          deliveryMode: 'OWN_WAREHOUSE',
          isFinal: true,
          deliveryDate: new Date('2026-12-01T00:00:00.000Z'),
          paymentDueAt: new Date('2026-12-31T00:00:00.000Z'),
          quantity: 6,
          unit: 'TON',
          ...fields,
          destination: 'Hamburg',
          shipmentPort: 'Shanghai',
          shipmentDate: new Date('2026-11-10T00:00:00.000Z'),
          etaDate: new Date('2026-12-05T00:00:00.000Z'),
          arrivalPort: 'Hamburg',
          customerPickedUp: false,
          hasRemittance: false,
          remittedFen: 0,
        },
      },
      shipments: {
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

async function seedBareExport(opts: {
  caseNo: string;
  title: string;
  scenario: string;
  status: string;
  currentNode: string;
  overallRisk?: string;
  buyer: string;
  country: string;
  goodsDesc: string;
  goodsSpec?: string;
  destination: string;
  amountFen: number;
  currency?: string;
  incoterms?: string;
  paymentTerms?: string;
  receivedFen?: number;
  receivedAt?: Date | null;
  shipment?: boolean;
  limitFen?: number;
  limitRef?: string;
  fileName?: string;
  nodeOverrides: Record<string, Partial<{ status: string; decision: string | null; summary: string }>>;
  salesId: string;
  approverId?: string;
  shipmentDate?: Date | null;
  customerPickedUp?: boolean | null;
  ttTiming?: string | null;
  ttPercentBps?: number | null;
  ttAdvanceFen?: number | null;
  ttDaysAfterShipment?: number | null;
  deliveryDate?: Date;
  quantity?: number;
  unit?: string;
  deliveryMode?: string;
  directPortJson?: string | null;
}) {
  const currency = opts.currency || 'USD';
  const incoterms = opts.incoterms || 'CIF';
  const c = await prisma.tradeCase.create({
    data: {
      caseNo: opts.caseNo,
      title: opts.title,
      scenario: opts.scenario,
      status: opts.status,
      currentNode: opts.currentNode,
      overallRisk: opts.overallRisk || 'LOW',
      goodsDesc: opts.goodsDesc,
      goodsSpec: opts.goodsSpec || null,
      destination: opts.destination,
      amountFen: opts.amountFen,
      currency,
      parties: {
        create: [
          { role: 'BUYER', name: opts.buyer, country: opts.country, isSameAsBuyer: true },
          { role: 'PAYER', name: opts.buyer, country: opts.country, isSameAsBuyer: true },
          { role: 'CONSIGNEE', name: opts.buyer, country: opts.country, isSameAsBuyer: true },
        ],
      },
      nodes: { create: nodeCreates(opts.nodeOverrides) },
      contract: {
        create: {
          counterparty: opts.buyer,
          buyerName: opts.buyer,
          consigneeName: opts.buyer,
          goodsDesc: opts.goodsDesc,
          goodsSpec: opts.goodsSpec || null,
          amountFen: opts.amountFen,
          currency,
          incoterms,
          paymentTerms: opts.paymentTerms || 'T/T 30 days',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          deliveryMode: opts.deliveryMode || 'OWN_WAREHOUSE',
          directPortJson: opts.directPortJson ?? null,
          isFinal: opts.currentNode !== 'N3',
          deliveryDate: opts.deliveryDate || new Date('2026-12-15T00:00:00.000Z'),
          quantity: opts.quantity ?? 2,
          unit: opts.unit || 'TON',
          destination: opts.destination,
          shipmentDate: opts.shipmentDate ?? null,
          customerPickedUp: opts.customerPickedUp ?? null,
          ttTiming: opts.ttTiming ?? null,
          ttPercentBps: opts.ttPercentBps ?? null,
          ttAdvanceFen: opts.ttAdvanceFen ?? null,
          ttDaysAfterShipment: opts.ttDaysAfterShipment ?? null,
          hasRemittance: (opts.receivedFen ?? 0) > 0,
          remittedFen: opts.receivedFen ?? 0,
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
      payload: JSON.stringify({ hits: [], disclaimer: 'mock' }),
    },
  });
  if (opts.shipment && opts.approverId) {
    await prisma.shipment.create({
      data: {
        caseId: c.id,
        hasCustomerWrittenInstruction: true,
        instructionRef: `INST-${opts.caseNo}`,
        hasInternalApproval: true,
        approverId: opts.approverId,
        blControl: 'ORIGINAL',
        blNo: `BL-${opts.caseNo}`,
        vessel: 'EVER GOODS',
        consigneeOnBl: opts.buyer,
      },
    });
  }
  if (opts.receivedFen != null || opts.receivedAt) {
    await prisma.settlement.create({
      data: {
        caseId: c.id,
        payerName: opts.buyer,
        buyerName: opts.buyer,
        isThirdParty: false,
        hasRemittanceMemo: true,
        remittanceMemoRef: `SWIFT-${opts.caseNo}`,
        hasDocConsistencyProof: true,
        hasReleaseApproval: true,
        amountFen: opts.receivedFen ?? 0,
        receivedAt: opts.receivedAt ?? null,
      },
    });
  }
  if (opts.limitFen && opts.limitFen > 0) {
    const evSin = await prisma.evidence.create({
      data: {
        caseId: c.id,
        nodeCode: 'N3',
        kind: 'SINOSURE_POLICY',
        ref: opts.limitRef || `SIN-${opts.caseNo}`,
        note: '中信保保单/限额批注',
        payload: JSON.stringify({ insuredLimitFen: opts.limitFen, currency }),
      },
    });
    await prisma.sinosurePolicy.create({
      data: {
        caseId: c.id,
        nodeCode: 'N3',
        evidenceId: evSin.id,
        evidenceRef: opts.limitRef || `SIN-${opts.caseNo}`,
        fileName: opts.fileName || `中信保限额批注-${opts.buyer.replace(/\s+/g, '')}.pdf`,
        insuredLimitFen: opts.limitFen,
        currency,
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      caseId: c.id,
      actorId: opts.salesId,
      action: 'CASE_CREATED',
      nodeCode: 'N1',
      detail: JSON.stringify({ scenario: opts.scenario }),
    },
  });
  return c;
}

async function seedNordlichtWipCase(salesId: string) {
  return seedBareExport({
    caseNo: 'DEMO-NORD-WIP',
    title: '北海机电出口德国 Nordlicht（CIF + 后 T/T，在手未装运）',
    scenario: 'OPEN_UNFULFILLED',
    status: 'IN_PROGRESS',
    currentNode: 'N5',
    buyer: 'Nordlicht GmbH',
    country: 'DE',
    goodsDesc: '数控机床配件',
    destination: 'Hamburg, DE',
    amountFen: 1_800_000,
    incoterms: 'CIF',
    paymentTerms: '后 T/T 30 days',
    ttTiming: 'AFTER',
    ttDaysAfterShipment: 30,
    limitFen: 15_000_000,
    limitRef: 'SIN-NL-2026',
    fileName: '中信保限额批注-Nordlicht.pdf',
    salesId,
    nodeOverrides: {
      N1: { status: 'PASSED', decision: 'PASS', summary: '当事方齐全，筛查未命中' },
      N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
      N3: { status: 'PASSED', decision: 'PASS', summary: '销售合同条款齐全，中信保限额覆盖合同金额' },
      N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
      N5: { status: 'IN_PROGRESS', decision: null, summary: '待登记采购合同并关联本销售案件 DEMO-NORD-WIP' },
    },
  });
}

async function seedHeliosMediumBundle(salesId: string, approverId: string) {
  const buyer = 'Helios Marine Ltd';
  const limitFen = 4_000_000;
  const done = await seedBareExport({
    caseNo: 'DEMO-HELIOS-DONE',
    title: '闽南泵业出口 Helios（已履行完毕，尚有未回款）',
    scenario: 'EXPOSURE_FULFILLED_UNPAID',
    status: 'COMPLETED',
    currentNode: 'N9',
    buyer,
    country: 'GR',
    goodsDesc: '工业泵',
    destination: 'Piraeus, GR',
    amountFen: 2_500_000,
    receivedFen: 500_000,
    receivedAt: new Date('2026-08-01T00:00:00.000Z'),
    shipment: true,
    shipmentDate: new Date('2026-05-20T00:00:00.000Z'),
    customerPickedUp: true,
    approverId,
    limitFen,
    limitRef: 'SIN-HELIOS-2026',
    fileName: '中信保限额批注-Helios.pdf',
    salesId,
    deliveryDate: new Date('2026-06-01T00:00:00.000Z'),
    nodeOverrides: {
      ...Object.fromEntries(
        ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N9'].map((code) => [
          code,
          { status: 'PASSED', decision: 'PASS', summary: '已履行完毕，部分收汇' },
        ]),
      ),
    },
  });
  const wip = await seedBareExport({
    caseNo: 'DEMO-HELIOS-WIP',
    title: '闽南泵业出口 Helios（FOB + 前 T/T，未履行完毕未回款）',
    scenario: 'EXPOSURE_OPEN_UNPAID',
    status: 'IN_PROGRESS',
    currentNode: 'N5',
    buyer,
    country: 'GR',
    goodsDesc: '工业泵',
    destination: 'Piraeus, GR',
    amountFen: 800_000,
    incoterms: 'FOB',
    paymentTerms: '前 T/T',
    ttTiming: 'ADVANCE',
    ttPercentBps: 3_000,
    ttAdvanceFen: 240_000,
    limitFen,
    limitRef: 'SIN-HELIOS-2026',
    fileName: '中信保限额批注-Helios.pdf',
    salesId,
    nodeOverrides: {
      N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
      N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
      N3: { status: 'PASSED', decision: 'PASS', summary: '条款与中信保限额齐全' },
      N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
      N5: { status: 'IN_PROGRESS', decision: null, summary: '待登记采购合同并关联本销售案件 DEMO-HELIOS-WIP，尚未装运' },
    },
  });
  const n3 = await seedBareExport({
    caseNo: 'DEMO-LIMIT-MED',
    title: '闽南泵业出口 Helios（占用超额中风险）',
    scenario: 'SINOSURE_EXPOSURE_MEDIUM',
    status: 'IN_PROGRESS',
    currentNode: 'N3',
    buyer,
    country: 'GR',
    goodsDesc: '工业泵',
    destination: 'Piraeus, GR',
    amountFen: 2_500_000,
    limitFen,
    limitRef: 'SIN-HELIOS-2026',
    fileName: '中信保限额批注-Helios.pdf',
    salesId,
    quantity: 5,
    nodeOverrides: {
      N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
      N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
      N3: {
        status: 'IN_PROGRESS',
        decision: null,
        summary: '新签将使占用超额约 1.3 万美元，中风险软提示，可推进',
      },
    },
  });
  return { done, wip, n3 };
}

async function seedSinosureHighCase(salesId: string) {
  const c = await seedBareExport({
    caseNo: 'DEMO-LIMIT-HIGH',
    title: '闽南泵业出口 Caspian Spare（占用超额高风险）',
    scenario: 'SINOSURE_EXPOSURE_HIGH',
    status: 'IN_PROGRESS',
    currentNode: 'N3',
    buyer: 'Caspian Spare Ltd',
    country: 'KZ',
    goodsDesc: '工业泵',
    destination: 'Aktau, KZ',
    amountFen: 7_500_000,
    limitFen: 5_000_000,
    limitRef: 'SIN-CASPIAN-2026',
    fileName: '中信保限额批注-Caspian.pdf',
    salesId,
    quantity: 8,
    nodeOverrides: {
      N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
      N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
      N3: {
        status: 'REVIEW',
        decision: 'REVIEW',
        summary: '新签使占用超额 2.5 万美元，高风险须工作台领取并放行',
      },
    },
  });
  const occupancyFen = 7_500_000;
  const insuredLimitFen = 5_000_000;
  const excessFen = occupancyFen - insuredLimitFen;
  await prisma.occupancyReview.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      status: OccupancyReviewStatus.OPEN,
      band: 'HIGH',
      occupancyFen,
      excessFen,
      insuredLimitFen,
      currency: 'USD',
      fingerprint: occupancyFingerprint({ occupancyFen, excessFen, insuredLimitFen }),
    },
  });
  await prisma.auditLog.create({
    data: {
      caseId: c.id,
      actorId: salesId,
      action: 'OCCUPANCY_REVIEW_ENQUEUED',
      nodeCode: 'N3',
      detail: JSON.stringify({
        band: 'HIGH',
        occupancyFen,
        excessFen,
        insuredLimitFen,
        note: '种子：占用高风险进入工作台，放行后可推进，无需改金额',
      }),
    },
  });
  return c;
}

async function seedDirectPortYellowCase(salesId: string) {
  const dp = completeDirectPortFixture();
  const salesFen = 5_000_000;
  const purchaseFen = 4_920_000;
  const c = await seedBareExport({
    caseNo: 'DEMO-PORT-YELLOW',
    title: '联运出口 Ostsee（港口直出薄利黄灯）',
    scenario: 'TAX_FINANCE_YELLOW',
    status: 'IN_PROGRESS',
    currentNode: 'N5',
    overallRisk: 'MEDIUM',
    buyer: 'Ostsee Tools GmbH',
    country: 'DE',
    goodsDesc: '工业泵',
    destination: 'Hamburg, DE',
    amountFen: salesFen,
    incoterms: 'FOB',
    paymentTerms: 'T/T 30 days',
    limitFen: 15_000_000,
    limitRef: 'SIN-OSTSEE-2026',
    fileName: '中信保限额批注-Ostsee.pdf',
    salesId,
    quantity: 4,
    unit: 'TON',
    deliveryMode: DeliveryMode.DIRECT_PORT,
    directPortJson: stringifyDirectPort(dp),
    nodeOverrides: {
      N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
      N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
      N3: {
        status: 'PASSED',
        decision: 'PASS',
        summary: '港口直出已填仓储地点与批次号',
      },
      N4: { status: 'PASSED', decision: 'PASS', summary: '无待确认变更' },
      N5: {
        status: 'REVIEW',
        decision: 'REVIEW',
        summary: '港口直出叠加购销薄利，须工作台退税·融资性审核',
      },
    },
  });
  await prisma.party.create({
    data: {
      caseId: c.id,
      role: 'SUPPLIER',
      name: '杭州联运贸易有限公司',
      country: 'CN',
      registrationNo: '91330100MA2PORT01',
      address: '浙江省杭州市',
      isSameAsBuyer: false,
    },
  });
  await prisma.procurementPlan.create({
    data: {
      caseId: c.id,
      salesCaseId: c.id,
      poNo: 'PO-PORT-YELLOW-001',
      plannedArrival: new Date('2026-11-20'),
      contractDelivery: new Date('2026-12-15'),
      poEvidenceStub: 'PO-PORT-YELLOW-001.pdf',
      delayRegistered: false,
      amountFen: purchaseFen,
      currency: 'CNY',
      ...paymentSchedule(purchaseFen, [
        {
          percent: 100,
          label: '一次性付清',
          conditionText: '一次性付清',
          dueAt: new Date('2026-11-25T00:00:00.000Z'),
        },
      ]),
    },
  });
  await attachClearSupplierScreen(c.id, '杭州联运贸易有限公司');
  const fingerprint = taxFinanceFingerprint({
    band: 'YELLOW',
    reasonCode: 'FT1_THIN_MARGIN',
    deliveryMode: DeliveryMode.DIRECT_PORT,
    marginBps: Math.round(((salesFen - purchaseFen) / salesFen) * 10000),
    emptyTurn: false,
    docsComplete: true,
    goodsMatch: true,
  });
  await prisma.taxFinanceReview.create({
    data: {
      caseId: c.id,
      nodeCode: 'N5',
      status: TaxFinanceReviewStatus.OPEN,
      band: 'YELLOW',
      reasonCode: 'FT1_THIN_MARGIN',
      summary: '港口直出叠加采购-销售薄利，须在审核工作台领取并通过后方可推进（不强制自有仓）',
      fingerprint,
    },
  });
  return c;
}

async function seedDirectPortRedCase(salesId: string) {
  const dp = completeDirectPortFixture({
    emptyTurnLikely: true,
    emptyTurnAnswer: '无实货周转，仅合同与发票对倒',
    emptyTurnRef: 'NOTE-LOOP-RED',
  });
  const c = await seedBareExport({
    caseNo: 'DEMO-PORT-RED',
    title: '空转迹象 Loopturn（港口直出红线）',
    scenario: 'TAX_FINANCE_RED',
    status: 'BLOCKED',
    currentNode: 'N3',
    overallRisk: 'HIGH',
    buyer: 'Loopturn Trading Ltd',
    country: 'VG',
    goodsDesc: '工业泵',
    destination: 'Road Town, VG',
    amountFen: 4_000_000,
    incoterms: 'CIF',
    paymentTerms: 'T/T 30 days',
    limitFen: 15_000_000,
    limitRef: 'SIN-LOOP-2026',
    fileName: '中信保限额批注-Loopturn.pdf',
    salesId,
    quantity: 3,
    unit: 'TON',
    deliveryMode: DeliveryMode.DIRECT_PORT,
    directPortJson: stringifyDirectPort(dp),
    nodeOverrides: {
      N1: { status: 'PASSED', decision: 'PASS', summary: '筛查通过' },
      N2: { status: 'PASSED', decision: 'PASS', summary: '报价要素齐全' },
      N3: {
        status: 'BLOCKED',
        decision: 'HARD_BLOCK',
        summary: '红线：港口直出迹象像空转/假出口，硬拦截',
      },
    },
  });
  const fingerprint = taxFinanceFingerprint({
    band: 'RED',
    reasonCode: 'FT2_EMPTY_TURN',
    deliveryMode: DeliveryMode.DIRECT_PORT,
    marginBps: null,
    emptyTurn: true,
    docsComplete: true,
    goodsMatch: true,
  });
  await prisma.taxFinanceReview.create({
    data: {
      caseId: c.id,
      nodeCode: 'N3',
      status: TaxFinanceReviewStatus.HARD_BLOCKED,
      band: 'RED',
      reasonCode: 'FT2_EMPTY_TURN',
      summary: '红线：港口直出迹象像空转/假出口，硬拦截，不得推进',
      fingerprint,
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

/** 把种子里仍挂在案件上的装运/收汇/单证归到默认批次 1。已有批次的案件不动。 */
async function ensureDemoBatches() {
  const cases = await prisma.tradeCase.findMany({
    include: {
      contract: true,
      nodes: true,
      shipmentBatches: true,
      shipments: true,
      settlements: true,
    },
  });
  for (const c of cases) {
    if (c.shipmentBatches.length) continue;
    const described = describeDefaultBatch({
      status: c.status,
      currentNode: c.currentNode,
      nodes: c.nodes,
    });
    const batch = await prisma.shipmentBatch.create({
      data: {
        caseId: c.id,
        batchNo: '1',
        seq: 1,
        quantity: c.contract?.quantity ?? null,
        unit: c.contract?.unit ?? null,
        amountFen: c.contract?.amountFen ?? c.amountFen,
        currency: c.contract?.currency || c.currency,
        currentNode: described.currentNode,
        status: described.status,
        shipmentPort: c.contract?.shipmentPort ?? null,
        shipmentDate: c.contract?.shipmentDate ?? null,
        etaDate: c.contract?.etaDate ?? null,
        arrivalPort: c.contract?.arrivalPort ?? null,
        nodes: { create: described.nodes },
      },
    });
    const shipment = c.shipments[0];
    if (shipment && !shipment.batchId) {
      await prisma.shipment.update({ where: { id: shipment.id }, data: { batchId: batch.id } });
    }
    const settlement = c.settlements[0];
    if (settlement && !settlement.batchId) {
      await prisma.settlement.update({ where: { id: settlement.id }, data: { batchId: batch.id } });
    }
    await prisma.tradeDocument.updateMany({
      where: { caseId: c.id, batchId: null },
      data: { batchId: batch.id },
    });
    await prisma.docMismatchFix.updateMany({
      where: { caseId: c.id, batchId: null },
      data: { batchId: batch.id },
    });
    await prisma.evidence.updateMany({
      where: { caseId: c.id, nodeCode: { in: ['N6', 'N7', 'N9'] }, batchId: null },
      data: { batchId: batch.id },
    });
    await prisma.gateCheck.updateMany({
      where: { caseId: c.id, nodeCode: { in: ['N6', 'N7', 'N9'] }, batchId: null },
      data: { batchId: batch.id },
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

async function linkProcurementPlansToSalesCases() {
  const plans = await prisma.procurementPlan.findMany({
    include: {
      case: { include: { contract: true, parties: true } },
    },
  });
  const pairs: Array<{ poNo: string | null; caseNo: string; salesCaseNo: string; customer: string }> = [];
  for (const plan of plans) {
    const salesCaseId = plan.salesCaseId || plan.caseId;
    if (!plan.salesCaseId) {
      await prisma.procurementPlan.update({
        where: { id: plan.id },
        data: { salesCaseId },
      });
    }
    const sales = salesCaseId === plan.caseId ? plan.case : await prisma.tradeCase.findUnique({
      where: { id: salesCaseId },
      include: { contract: true, parties: true },
    });
    const customer =
      sales?.contract?.counterparty ||
      sales?.parties.find((p) => p.role === 'BUYER')?.name ||
      plan.case.contract?.counterparty ||
      '—';
    pairs.push({
      poNo: plan.poNo,
      caseNo: plan.case.caseNo,
      salesCaseNo: sales?.caseNo || plan.case.caseNo,
      customer,
    });
  }
  return pairs;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
