import { Decision } from '../common/constants';
import { CaseSnapshot } from '../common/types';
import { evaluateNode } from '../gates/gate.engine';
import {
  DeliveryMode,
  FT4_DECLARE_REASON,
  TAX_FINANCE_DIRECT_DOCS_REASON,
  TAX_FINANCE_EMPTY_TURN_REASON,
  TAX_FINANCE_YELLOW_REVIEW_REASON,
  TaxFinanceBand,
  TaxFinanceReviewStatus,
  TaxFinanceWorkbenchAction,
  THIN_MARGIN_BPS,
  applyTaxFinanceGate,
  completeDirectPortFixture,
  evaluateFt4,
  evaluateTaxFinance,
  isDirectPortComplete,
  isTaxFinanceWorkbenchAction,
  isThinMargin,
  parseDirectPort,
  planTaxFinanceReviewSync,
  purchaseSalesMarginBps,
  stringifyDirectPort,
  taxFinanceActionNextStatus,
  taxFinanceFingerprint,
} from './tax-finance';

function base(over: Partial<CaseSnapshot> = {}): CaseSnapshot {
  return {
    parties: [
      { role: 'BUYER', name: 'Ostsee Tools GmbH' },
      { role: 'PAYER', name: 'Ostsee Tools GmbH' },
      { role: 'CONSIGNEE', name: 'Ostsee Tools GmbH' },
      { role: 'SUPPLIER', name: '杭州联运贸易有限公司' },
    ],
    hits: [],
    kycRan: true,
    contract: {
      incoterms: 'FOB',
      paymentTerms: 'T/T 30 days',
      hasRetentionOfTitle: true,
      hasDisputeClause: true,
      isFinal: true,
      buyerName: 'Ostsee Tools GmbH',
      consigneeName: 'Ostsee Tools GmbH',
      goodsDesc: '工业泵',
      amountFen: 5_000_000,
      currency: 'USD',
      deliveryMode: DeliveryMode.DIRECT_PORT,
      directPort: completeDirectPortFixture(),
      quantity: 4,
    },
    shipment: {
      hasCustomerWrittenInstruction: true,
      instructionRef: 'INST-PORT',
      hasInternalApproval: true,
      blControl: 'ORIGINAL',
      blNo: 'COSU-PORT',
      consigneeOnBl: 'Ostsee Tools GmbH',
    },
    documents: [],
    mismatchFixes: [],
    settlement: {
      payerName: 'Ostsee Tools GmbH',
      buyerName: 'Ostsee Tools GmbH',
      isThirdParty: false,
      hasThirdPartyProof: false,
      hasRemittanceMemo: true,
      remittanceMemoRef: 'SWIFT-PORT',
      hasDocConsistencyProof: true,
      hasReleaseApproval: true,
      amountFen: 5_000_000,
    },
    nodes: [
      { code: 'N1', status: 'PASSED' },
      { code: 'N3', status: 'PASSED' },
      { code: 'N7', status: 'PASSED' },
    ],
    quotes: [],
    changeOrders: [],
    procurementPlan: {
      poNo: 'PO-PORT-YELLOW',
      plannedArrival: '2026-11-20',
      delayRegistered: false,
      customerConsent: false,
      salesCaseId: 'sales-1',
      salesContractSigned: true,
      amountFen: 4_920_000,
      currency: 'USD',
    },
    supplierScreened: true,
    customs: {
      hsCode: '8413.70.00',
      productName: '工业泵',
      declareElements: { 品牌: 'Beihai', 型号: 'P-1', 扬程: '50m', 介质: '水' },
      originCountry: 'CN',
      originEvidenceType: 'CO',
      originEvidenceRef: 'CO-PORT',
      unit: '台',
      exportTaxName: '离心泵',
      eportStatus: 'RELEASED',
    },
    hsTemplate: {
      hsCode: '8413.70.00',
      productName: '工业泵',
      requiredElements: ['品牌', '型号', '扬程', '介质'],
      unit: '台',
      exportTaxName: '离心泵',
    },
    costFloorFen: 400000,
    historyUnitPrices: [],
    caseAmountFen: 5_000_000,
    caseCurrency: 'USD',
    caseGoodsDesc: '工业泵',
    sinosurePolicies: [
      {
        nodeCode: 'N3',
        evidenceRef: 'SIN-PORT',
        evidenceId: 'ev-port',
        insuredLimitFen: 15_000_000,
        currency: 'USD',
      },
    ],
    occupancyReviews: [],
    taxFinanceReviews: [],
    taxRebate: {
      inputInvoiceNo: 'INV-IN-2026-088',
      flowGoods: true,
      flowCustoms: true,
      flowInvoice: true,
      flowRemittance: true,
    },
    ...over,
  };
}

describe('FT1 交货方式与购销匹配', () => {
  it('N3 未选交货方式不得签订/推进', () => {
    const r = evaluateNode(
      'N3',
      base({
        contract: { ...base().contract!, deliveryMode: null, directPort: null },
        procurementPlan: null,
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.decision).toBe(Decision.HARD_BLOCK);
    expect(r.missing).toContain('FT1_DELIVERY_MODE');
  });

  it('自有仓不是必选项：港口直出且四问齐全、毛利正常可通过', () => {
    const r = evaluateNode(
      'N3',
      base({
        procurementPlan: {
          ...base().procurementPlan!,
          amountFen: 4_000_000,
        },
      }),
    );
    expect(r.missing).not.toContain('FT1_DELIVERY_MODE');
    expect(r.missing).not.toContain('FT2_DIRECT_PORT_DOCS');
    expect(r.canProceed).toBe(true);
    expect(r.taxFinance?.deliveryMode).toBe(DeliveryMode.DIRECT_PORT);
  });

  it('购销货描严重不符为红线硬拦截', () => {
    const r = evaluateTaxFinance(
      base({
        caseGoodsDesc: '汽车制动组件',
        procurementPlan: { ...base().procurementPlan!, poNo: 'PO-X' },
      }),
      'N5',
    );
    expect(r.decision).toBe(Decision.HARD_BLOCK);
    expect(r.missing).toContain('FT1_GOODS_MISMATCH');
    expect(r.view.band).toBe(TaxFinanceBand.RED);
  });

  it('薄利 + 港口直出为黄灯审核队列', () => {
    expect(isThinMargin(purchaseSalesMarginBps(5_000_000, 4_920_000))).toBe(true);
    expect(purchaseSalesMarginBps(5_000_000, 4_920_000)).toBeLessThan(THIN_MARGIN_BPS);
    const r = evaluateNode('N5', base());
    expect(r.canProceed).toBe(false);
    expect(r.decision).toBe(Decision.REVIEW);
    expect(r.missing).toContain('FT1_THIN_MARGIN');
    expect(r.reasons.join('')).toContain('工作台');
    expect(r.taxFinance?.band).toBe(TaxFinanceBand.YELLOW);
  });

  it('黄灯领取/通过后可推进，驳回后仍阻断', () => {
    const snap = base();
    const tf = evaluateTaxFinance(snap, 'N5');
    const fp = tf.view.fingerprint;
    const approved = evaluateNode('N5', {
      ...snap,
      taxFinanceReviews: [
        { nodeCode: 'N5', status: TaxFinanceReviewStatus.APPROVED, fingerprint: fp, band: 'YELLOW' },
      ],
    });
    expect(approved.canProceed).toBe(true);
    expect(approved.alerts.join('')).toContain('已通过');

    const rejected = evaluateNode('N5', {
      ...snap,
      taxFinanceReviews: [
        { nodeCode: 'N5', status: TaxFinanceReviewStatus.REJECTED, fingerprint: fp, band: 'YELLOW' },
      ],
    });
    expect(rejected.canProceed).toBe(false);
    expect(rejected.decision).toBe(Decision.REVIEW);
    expect(rejected.reasons.join('')).toContain('驳回');
  });
});

describe('FT2 港口直出仓储/批次', () => {
  it('直出缺仓储地点/批次号不得推进', () => {
    const r = evaluateNode(
      'N3',
      base({
        contract: {
          ...base().contract!,
          deliveryMode: DeliveryMode.DIRECT_PORT,
          directPort: { emptyTurnLikely: false },
        },
        procurementPlan: null,
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.decision).toBe(Decision.HARD_BLOCK);
    expect(r.missing).toEqual(
      expect.arrayContaining([
        'FT2_DIRECT_PORT_DOCS',
        'FT2_WAREHOUSE_LOCATION',
        'FT2_BATCH_NO',
      ]),
    );
    expect(r.missing).not.toContain('FT2_E_LEDGER');
    expect(r.reasons.join('')).toContain('仓储地点');
  });

  it('仓储地点与批次号齐全则 isDirectPortComplete，不要求电子底账', () => {
    expect(isDirectPortComplete(completeDirectPortFixture())).toBe(true);
    expect(isDirectPortComplete({ warehouseLocation: 'x' })).toBe(false);
    expect(isDirectPortComplete({ warehouseLocation: '仓', batchNo: 'B1' })).toBe(true);
    expect(
      isDirectPortComplete({
        goodsWhereAnswer: '仓',
        goodsWhereRef: 'B1',
      }),
    ).toBe(true);
  });

  it('stringifyDirectPort 不写入电子底账编号，旧 JSON 解析后也不再要求', () => {
    const json = stringifyDirectPort({
      warehouseLocation: '仓',
      batchNo: 'B1',
      eLedgerNo: 'E1',
      customsPartyRef: 'E1',
    } as any);
    const parsed = JSON.parse(json!);
    expect(parsed.eLedgerNo).toBeUndefined();
    expect(parsed.customsPartyRef).toBeUndefined();
    expect(parsed.warehouseLocation).toBe('仓');
    expect(parsed.batchNo).toBe('B1');
    expect(isDirectPortComplete(parseDirectPort(json))).toBe(true);
    expect(
      isDirectPortComplete(
        parseDirectPort(
          JSON.stringify({ warehouseLocation: '仓', batchNo: 'B1', eLedgerNo: 'OLD' }),
        ),
      ),
    ).toBe(true);
  });

  it('自答像空转为红线硬拦截，不进可处置队列', () => {
    const r = evaluateTaxFinance(
      base({
        contract: {
          ...base().contract!,
          directPort: completeDirectPortFixture({ emptyTurnLikely: true, emptyTurnAnswer: '无实货' }),
        },
      }),
      'N3',
    );
    expect(r.decision).toBe(Decision.HARD_BLOCK);
    expect(r.view.band).toBe(TaxFinanceBand.RED);
    expect(r.missing).toContain('FT2_EMPTY_TURN');
    expect(r.reasons).toContain(TAX_FINANCE_EMPTY_TURN_REASON);
  });
});

describe('FT3 装运报关与直出单证', () => {
  it('报关品名与合同货描严重不符为红线', () => {
    const r = evaluateNode(
      'N8',
      base({
        customs: {
          ...base().customs!,
          productName: '汽车制动组件',
        },
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.decision).toBe(Decision.HARD_BLOCK);
    expect(r.missing).toContain('FT3_GOODS_MISMATCH');
  });

  it('直出单证与报关一致且四问齐全不因无自有仓拦截', () => {
    const r = evaluateTaxFinance(
      base({
        procurementPlan: { ...base().procurementPlan!, amountFen: 4_000_000 },
      }),
      'N8',
    );
    expect(r.decision).toBe(Decision.PASS);
    expect(r.missing).not.toContain('FT3_GOODS_MISMATCH');
    expect(r.view.directPortComplete).toBe(true);
  });
});

describe('FT4 退税就绪清单', () => {
  it('缺进项发票或四流勾选不得申报', () => {
    const incomplete = evaluateFt4(base({ taxRebate: { flowGoods: false } }));
    expect(incomplete.canDeclare).toBe(false);
    expect(incomplete.missing).toEqual(expect.arrayContaining(['FT4_FLOW_GOODS', 'FT4_INPUT_INVOICE']));
    expect(incomplete.reasons[0]).toBe(FT4_DECLARE_REASON);
  });

  it('报关放行 + N9 收汇 + 发票号 + 四流齐全可申报', () => {
    const ok = evaluateFt4(base());
    expect(ok.canDeclare).toBe(true);
    expect(ok.missing).toEqual([]);
    expect(ok.items.every((i) => i.ok)).toBe(true);
  });
});

describe('退税·融资性工作台状态机', () => {
  it('领取 / 通过 / 驳回；红线只读不可通过', () => {
    expect(
      taxFinanceActionNextStatus(TaxFinanceReviewStatus.OPEN, TaxFinanceWorkbenchAction.CLAIM),
    ).toEqual({ ok: true, status: TaxFinanceReviewStatus.CLAIMED });
    expect(
      taxFinanceActionNextStatus(TaxFinanceReviewStatus.CLAIMED, TaxFinanceWorkbenchAction.APPROVE),
    ).toEqual({ ok: true, status: TaxFinanceReviewStatus.APPROVED });
    expect(
      taxFinanceActionNextStatus(TaxFinanceReviewStatus.CLAIMED, TaxFinanceWorkbenchAction.REJECT),
    ).toEqual({ ok: true, status: TaxFinanceReviewStatus.REJECTED });
    expect(taxFinanceActionNextStatus(TaxFinanceReviewStatus.HARD_BLOCKED, TaxFinanceWorkbenchAction.APPROVE).ok).toBe(
      false,
    );
    expect(isTaxFinanceWorkbenchAction('APPROVE')).toBe(true);
    expect(isTaxFinanceWorkbenchAction('FALSE_POSITIVE')).toBe(false);
  });

  it('黄灯入列、红线建只读硬拦截行、通过后指纹不变则保持', () => {
    const yellowFp = taxFinanceFingerprint({
      band: TaxFinanceBand.YELLOW,
      reasonCode: 'FT1_THIN_MARGIN',
      deliveryMode: DeliveryMode.DIRECT_PORT,
      marginBps: 160,
      emptyTurn: false,
      docsComplete: true,
      goodsMatch: true,
    });
    const yellow = planTaxFinanceReviewSync([], 'N5', {
      band: TaxFinanceBand.YELLOW,
      reasonCode: 'FT1_THIN_MARGIN',
      fingerprint: yellowFp,
      summary: TAX_FINANCE_YELLOW_REVIEW_REASON,
    });
    expect(yellow.create?.status).toBe(TaxFinanceReviewStatus.OPEN);
    expect(yellow.create?.band).toBe(TaxFinanceBand.YELLOW);

    const red = planTaxFinanceReviewSync(
      [{ id: 'y1', nodeCode: 'N3', status: TaxFinanceReviewStatus.OPEN, fingerprint: 'old' }],
      'N3',
      {
        band: TaxFinanceBand.RED,
        reasonCode: 'FT2_EMPTY_TURN',
        fingerprint: 'red-fp',
        summary: TAX_FINANCE_EMPTY_TURN_REASON,
      },
    );
    expect(red.create?.status).toBe(TaxFinanceReviewStatus.HARD_BLOCKED);
    expect(red.supersedeIds).toEqual(['y1']);

    const keep = planTaxFinanceReviewSync(
      [
        {
          id: 'ok',
          nodeCode: 'N5',
          status: TaxFinanceReviewStatus.APPROVED,
          fingerprint: yellowFp,
        },
      ],
      'N5',
      {
        band: TaxFinanceBand.YELLOW,
        reasonCode: 'FT1_THIN_MARGIN',
        fingerprint: yellowFp,
        summary: TAX_FINANCE_YELLOW_REVIEW_REASON,
      },
    );
    expect(keep.keepId).toBe('ok');
    expect(keep.create).toBeUndefined();
  });

  it('applyTaxFinanceGate 不覆盖已有硬拦截以外的占用结论，且 tab kind 为 TAX_FINANCE', () => {
    const blocked: ReturnType<typeof applyTaxFinanceGate> = applyTaxFinanceGate(
      {
        nodeCode: 'N5',
        decision: Decision.HARD_BLOCK,
        canProceed: false,
        missing: ['N5_PO_NO'],
        reasons: ['未填写采购订单'],
        alerts: [],
      },
      base({ procurementPlan: { ...base().procurementPlan!, poNo: '' } }),
    );
    expect(blocked.decision).toBe(Decision.HARD_BLOCK);
    expect(blocked.missing).toContain('N5_PO_NO');

    const passQuote = applyTaxFinanceGate(
      {
        nodeCode: 'N2',
        decision: Decision.PASS,
        canProceed: true,
        missing: [],
        reasons: [],
        alerts: [],
      },
      base(),
    );
    expect(passQuote.taxFinance).toBeUndefined();
    expect(TAX_FINANCE_DIRECT_DOCS_REASON).toContain('港口直出');
  });
});
