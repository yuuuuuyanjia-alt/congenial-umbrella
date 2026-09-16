import { Decision } from '../common/constants';
import { CaseSnapshot } from '../common/types';
import {
  evaluateN1,
  evaluateN2,
  evaluateN3,
  evaluateN4,
  evaluateN5,
  evaluateN6,
  evaluateN7,
  evaluateN8,
  evaluateN9,
  nextNode,
} from './gate.engine';

function baseSnap(over: Partial<CaseSnapshot> = {}): CaseSnapshot {
  return {
    parties: [
      { role: 'BUYER', name: 'Nordlicht GmbH' },
      { role: 'PAYER', name: 'Nordlicht GmbH' },
      { role: 'CONSIGNEE', name: 'Nordlicht GmbH' },
    ],
    hits: [],
    kycRan: true,
    contract: {
      incoterms: 'CIF',
      paymentTerms: 'T/T 30 days',
      hasRetentionOfTitle: true,
      hasDisputeClause: true,
      isFinal: true,
      buyerName: 'Nordlicht GmbH',
      consigneeName: 'Nordlicht GmbH',
      goodsDesc: 'CNC parts',
      amountFen: 1000000,
      currency: 'USD',
    },
    shipment: {
      hasCustomerWrittenInstruction: true,
      instructionRef: 'INST-001',
      hasInternalApproval: true,
      blControl: 'ORIGINAL',
      blNo: 'COSU123',
    },
    documents: [
      {
        type: 'CONTRACT',
        isFinal: true,
        fields: {
          buyerName: 'Nordlicht GmbH',
          consigneeName: 'Nordlicht GmbH',
          goodsDesc: 'CNC parts',
          amountFen: 1000000,
          currency: 'USD',
          incoterms: 'CIF',
        },
      },
      {
        type: 'INVOICE',
        isFinal: true,
        fields: {
          buyerName: 'Nordlicht GmbH',
          consigneeName: 'Nordlicht GmbH',
          goodsDesc: 'CNC parts',
          amountFen: 1000000,
          currency: 'USD',
          incoterms: 'CIF',
        },
      },
      {
        type: 'PACKING',
        isFinal: true,
        fields: {
          buyerName: 'Nordlicht GmbH',
          consigneeName: 'Nordlicht GmbH',
          goodsDesc: 'CNC parts',
          amountFen: 1000000,
          currency: 'USD',
          incoterms: 'CIF',
        },
      },
      {
        type: 'BL',
        isFinal: true,
        fields: {
          buyerName: 'Nordlicht GmbH',
          consigneeName: 'Nordlicht GmbH',
          goodsDesc: 'CNC parts',
          amountFen: 1000000,
          currency: 'USD',
          incoterms: 'CIF',
        },
      },
    ],
    mismatchFixes: [],
    settlement: {
      payerName: 'Nordlicht GmbH',
      buyerName: 'Nordlicht GmbH',
      isThirdParty: false,
      hasThirdPartyProof: false,
      hasRemittanceMemo: true,
      remittanceMemoRef: 'SWIFT-1',
      hasDocConsistencyProof: true,
      hasReleaseApproval: true,
    },
    nodes: [
      { code: 'N1', status: 'PASSED' },
      { code: 'N7', status: 'PASSED' },
    ],
    quotes: [
      {
        version: 1,
        status: 'ACTIVE',
        priceBasis: 'MIXED',
        includedItems: '海运费、出口报关费',
        excludedItems: '目的港关税',
        validityUntil: '2026-12-31',
        freightBearer: 'SELLER',
        taxBearer: 'BUYER',
        unitPriceFen: 1280000,
        quantity: 10,
        amountFen: 12800000,
      },
    ],
    changeOrders: [],
    productionPlan: {
      plannedDelivery: '2026-11-28',
      contractDelivery: '2026-11-30',
      delayRegistered: false,
      customerConsent: false,
    },
    customs: {
      hsCode: '8458.11.00',
      productName: '数控机床配件',
      declareElements: { 品牌: 'Beihai', 型号: 'BH-200', 用途: '金属切削', 是否数控: '是', 加工材料: '铸铁' },
      originCountry: 'CN',
      originEvidenceType: 'CO',
      originEvidenceRef: 'CO-2026-011',
      unit: '千克',
      exportTaxName: '加工中心用零件',
      eportStatus: 'RELEASED',
    },
    hsTemplate: {
      hsCode: '8458.11.00',
      productName: '数控机床配件',
      requiredElements: ['品牌', '型号', '用途', '是否数控', '加工材料'],
      unit: '千克',
      exportTaxName: '加工中心用零件',
    },
    costFloorFen: 1000000,
    historyUnitPrices: [1200000, 1300000, 1250000],
    now: '2026-09-16',
    ...over,
  };
}

describe('闸门引擎 MVP 节点', () => {
  it('N1 高置信命中硬拦截', () => {
    const r = evaluateN1(
      baseSnap({
        hits: [
          {
            listCode: 'OFAC',
            listedName: 'BANNED TRADING LLC',
            matchedName: 'BANNED TRADING LLC',
            confidence: 'HIGH',
            riskLevel: 'HIGH',
            disposition: 'OPEN',
            score: 98,
          },
        ],
      }),
    );
    expect(r.decision).toBe(Decision.HARD_BLOCK);
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N1_HIGH_CONFIDENCE_HIT');
  });

  it('N1 低置信软提示不阻断', () => {
    const r = evaluateN1(
      baseSnap({
        hits: [
          {
            listCode: 'OFAC',
            listedName: 'ACME INDUSTRIES LIMITED',
            matchedName: 'Acme Industrial Co',
            confidence: 'LOW',
            riskLevel: 'LOW',
            disposition: 'OPEN',
            score: 28,
          },
        ],
      }),
    );
    expect(r.decision).toBe(Decision.SOFT_ALERT);
    expect(r.canProceed).toBe(true);
  });

  it('N1 中风险进入审核队列', () => {
    const r = evaluateN1(
      baseSnap({
        hits: [
          {
            listCode: 'EU',
            listedName: 'FROZEN ASSETS HOLDINGS',
            matchedName: 'Frozen Asset Holding',
            confidence: 'MEDIUM',
            riskLevel: 'MEDIUM',
            disposition: 'OPEN',
            score: 64,
          },
        ],
      }),
    );
    expect(r.decision).toBe(Decision.REVIEW);
    expect(r.canProceed).toBe(false);
  });

  it('N3 缺少所有权保留/争议条款拒绝', () => {
    const r = evaluateN3(
      baseSnap({
        contract: {
          incoterms: 'FOB',
          paymentTerms: 'T/T',
          hasRetentionOfTitle: false,
          hasDisputeClause: false,
          isFinal: false,
        },
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['N3_RETENTION_OF_TITLE', 'N3_DISPUTE_CLAUSE']));
  });

  it('N6 缺少书面指示/审批/提单控制拒绝推进', () => {
    const r = evaluateN6(baseSnap({ shipment: null }));
    expect(r.canProceed).toBe(false);
    expect(r.decision).toBe(Decision.HARD_BLOCK);

    const r2 = evaluateN6(
      baseSnap({
        shipment: {
          hasCustomerWrittenInstruction: false,
          hasInternalApproval: false,
          blControl: null,
        },
      }),
    );
    expect(r2.canProceed).toBe(false);
    expect(r2.missing).toEqual(
      expect.arrayContaining([
        'N6_CUSTOMER_WRITTEN_INSTRUCTION',
        'N6_INTERNAL_APPROVAL',
        'N6_BL_CONTROL',
      ]),
    );
  });

  it('N6 证据齐全可通过', () => {
    expect(evaluateN6(baseSnap()).canProceed).toBe(true);
  });

  it('N7 缺终稿合同或单证不一致且无修改记录则拒绝', () => {
    const missingFinal = evaluateN7(
      baseSnap({
        contract: { ...baseSnap().contract!, isFinal: false },
        documents: baseSnap().documents.map((d) =>
          d.type === 'CONTRACT' ? { ...d, isFinal: false } : d,
        ),
      }),
    );
    expect(missingFinal.canProceed).toBe(false);
    expect(missingFinal.missing).toContain('N7_FINAL_CONTRACT');

    const mismatch = evaluateN7(
      baseSnap({
        documents: baseSnap().documents.map((d) =>
          d.type === 'INVOICE' ? { ...d, fields: { ...d.fields, buyerName: 'OTHER BUYER' } } : d,
        ),
      }),
    );
    expect(mismatch.canProceed).toBe(false);
    expect(mismatch.missing.some((m) => m.includes('buyerName'))).toBe(true);
  });

  it('N7 不符点有修改记录可通过', () => {
    const r = evaluateN7(
      baseSnap({
        documents: baseSnap().documents.map((d) =>
          d.type === 'INVOICE' ? { ...d, fields: { ...d.fields, buyerName: 'OTHER BUYER' } } : d,
        ),
        mismatchFixes: [
          {
            field: 'buyerName',
            fromValue: 'OTHER BUYER',
            toValue: 'Nordlicht GmbH',
            reason: '发票笔误已更正',
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(true);
  });

  it('N9 缺少第三方证明/汇款附言/单证证明/放行审批拒绝', () => {
    const r = evaluateN9(
      baseSnap({
        settlement: {
          payerName: 'Third Party Payer Inc',
          buyerName: 'Nordlicht GmbH',
          isThirdParty: true,
          hasThirdPartyProof: false,
          hasRemittanceMemo: false,
          hasDocConsistencyProof: false,
          hasReleaseApproval: false,
        },
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toEqual(
      expect.arrayContaining([
        'N9_REMITTANCE_MEMO',
        'N9_DOC_CONSISTENCY_PROOF',
        'N9_RELEASE_APPROVAL',
        'N9_THIRD_PARTY_RELATION_PROOF',
      ]),
    );
  });

  it('N9 单证一致性未通过时拒绝收汇', () => {
    const r = evaluateN9(baseSnap({ nodes: [{ code: 'N7', status: 'IN_PROGRESS' }] }));
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N9_PREREQ_DOC_CONSISTENCY');
  });
});

describe('闸门引擎 N2 报价环节', () => {
  it('模糊用语价格待定/费用另议不得推进', () => {
    const r = evaluateN2(
      baseSnap({
        quotes: [
          {
            ...baseSnap().quotes[0],
            notes: '价格待定，费用另议',
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N2_VAGUE_PRICING');
  });

  it('缺少价格基础/有效期/承担方拒绝', () => {
    const r = evaluateN2(
      baseSnap({
        quotes: [
          {
            version: 1,
            status: 'ACTIVE',
            priceBasis: '',
            validityUntil: null,
            freightBearer: null,
            taxBearer: null,
            unitPriceFen: 1280000,
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toEqual(
      expect.arrayContaining(['N2_PRICE_BASIS', 'N2_VALIDITY', 'N2_FREIGHT_BEARER', 'N2_TAX_BEARER']),
    );
  });

  it('含项目未列明所含费用拒绝', () => {
    const r = evaluateN2(
      baseSnap({
        quotes: [
          {
            ...baseSnap().quotes[0],
            priceBasis: 'INCLUSIVE',
            includedItems: '',
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N2_INCLUDED_ITEMS');
  });

  it('低于成本底线且无说明 → 中风险不可推进', () => {
    const r = evaluateN2(
      baseSnap({
        costFloorFen: 2000000,
        quotes: [{ ...baseSnap().quotes[0], unitPriceFen: 800000, abnormalPriceNote: '' }],
      }),
    );
    expect(r.decision).toBe(Decision.REVIEW);
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N2_BELOW_COST_FLOOR');
  });

  it('低于成本底线但已注明 → 软提示可推进', () => {
    const r = evaluateN2(
      baseSnap({
        costFloorFen: 2000000,
        quotes: [{ ...baseSnap().quotes[0], unitPriceFen: 800000, abnormalPriceNote: '清仓样件' }],
      }),
    );
    expect(r.decision).toBe(Decision.SOFT_ALERT);
    expect(r.canProceed).toBe(true);
  });

  it('较历史均价偏离 → 软提示', () => {
    const r = evaluateN2(
      baseSnap({
        historyUnitPrices: [1000000, 1100000],
        quotes: [{ ...baseSnap().quotes[0], unitPriceFen: 1600000 }],
      }),
    );
    expect(r.decision).toBe(Decision.SOFT_ALERT);
    expect(r.canProceed).toBe(true);
    expect(r.alerts.length).toBeGreaterThan(0);
  });

  it('报价要素齐全可通过', () => {
    expect(evaluateN2(baseSnap()).canProceed).toBe(true);
  });
});

describe('闸门引擎 N4 变更管理', () => {
  const pending = {
    id: 'ch1',
    changeNo: 'CO-001',
    version: 1,
    status: 'PENDING_ACK',
    isSensitive: false,
    customerAck: false,
    internalAck: false,
    approved: false,
    diffs: [
      { field: 'quantity', fieldLabel: '数量', oldValue: '8', newValue: '10' },
    ],
  };

  it('无变更单可直接过闸（按需）', () => {
    const r = evaluateN4(baseSnap({ changeOrders: [] }));
    expect(r.canProceed).toBe(true);
    expect(r.reasons.join('')).toContain('无待确认变更');
  });

  it('未确认变更单拒绝推进', () => {
    const r = evaluateN4(baseSnap({ changeOrders: [pending] }));
    expect(r.canProceed).toBe(false);
    expect(r.missing).toEqual(
      expect.arrayContaining(['N4_CUSTOMER_ACK_CO-001', 'N4_INTERNAL_ACK_CO-001']),
    );
  });

  it('敏感变更缺审批拒绝', () => {
    const r = evaluateN4(
      baseSnap({
        changeOrders: [
          {
            ...pending,
            isSensitive: true,
            customerAck: true,
            customerAckEvidenceId: 'ev-c',
            internalAck: true,
            internalAckEvidenceId: 'ev-i',
            diffs: [{ field: 'consigneeName', fieldLabel: '收货人', oldValue: 'A', newValue: 'B' }],
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N4_APPROVAL_CO-001');
  });

  it('确认齐全但未生效拒绝', () => {
    const r = evaluateN4(
      baseSnap({
        changeOrders: [
          {
            ...pending,
            customerAck: true,
            customerAckEvidenceId: 'ev-c',
            internalAck: true,
            internalAckEvidenceId: 'ev-i',
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N4_NOT_APPLIED_CO-001');
  });

  it('已生效的数量变更可通过', () => {
    const r = evaluateN4(
      baseSnap({
        changeOrders: [
          {
            ...pending,
            status: 'APPLIED',
            customerAck: true,
            customerAckEvidenceId: 'ev-c',
            internalAck: true,
            internalAckEvidenceId: 'ev-i',
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(true);
  });

  it('收货人变更为空时关联复核 N1 拒绝', () => {
    const r = evaluateN4(
      baseSnap({
        changeOrders: [
          {
            ...pending,
            status: 'APPLIED',
            isSensitive: true,
            customerAck: true,
            customerAckEvidenceId: 'ev-c',
            internalAck: true,
            internalAckEvidenceId: 'ev-i',
            approved: true,
            approvalEvidenceId: 'ev-a',
            diffs: [{ field: 'consigneeName', fieldLabel: '收货人', oldValue: 'Nordlicht GmbH', newValue: '   ' }],
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing.some((m) => m.includes('N1_PARTY_CONSIGNEE'))).toBe(true);
  });
});

describe('闸门引擎 N5 生产/备货排期', () => {
  it('计划交期不晚于合同交期可通过', () => {
    expect(evaluateN5(baseSnap()).canProceed).toBe(true);
  });

  it('晚于合同交期且未登记延期拒绝', () => {
    const r = evaluateN5(
      baseSnap({
        productionPlan: {
          plannedDelivery: '2026-12-20',
          contractDelivery: '2026-11-30',
          delayRegistered: false,
          customerConsent: false,
        },
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N5_DELAY_NOT_REGISTERED');
  });

  it('延期缺少结构化触发条件拒绝', () => {
    const r = evaluateN5(
      baseSnap({
        productionPlan: {
          plannedDelivery: '2026-12-20',
          contractDelivery: '2026-11-30',
          delayRegistered: true,
          delayTriggerCode: null,
          delayTriggerRef: null,
          customerConsent: false,
        },
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N5_DELAY_TRIGGER');
  });

  it('延期未经客户同意 → 中风险不可推进', () => {
    const r = evaluateN5(
      baseSnap({
        productionPlan: {
          plannedDelivery: '2026-12-20',
          contractDelivery: '2026-11-30',
          delayRegistered: true,
          delayTriggerCode: 'PORT_CONGESTION',
          customerConsent: false,
        },
      }),
    );
    expect(r.decision).toBe(Decision.REVIEW);
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N5_DELAY_WITHOUT_CONSENT');
  });

  it('延期已登记且客户同意证据可追溯可通过', () => {
    const r = evaluateN5(
      baseSnap({
        productionPlan: {
          plannedDelivery: '2026-12-20',
          contractDelivery: '2026-11-30',
          delayRegistered: true,
          delayTriggerCode: 'PORT_CONGESTION',
          delayTriggerRef: 'PORT-SG-09',
          customerConsent: true,
          customerConsentEvidenceId: 'ev-delay-1',
        },
      }),
    );
    expect(r.canProceed).toBe(true);
  });

  it('存在未生效变更单时不得进入排期', () => {
    const r = evaluateN5(
      baseSnap({
        changeOrders: [
          {
            id: 'ch1',
            changeNo: 'CO-001',
            version: 1,
            status: 'PENDING_ACK',
            isSensitive: false,
            customerAck: false,
            internalAck: false,
            approved: false,
            diffs: [{ field: 'quantity', fieldLabel: '数量', oldValue: '8', newValue: '10' }],
          },
        ],
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N5_PENDING_CHANGE');
  });
});

describe('闸门引擎 N8 报关放行', () => {
  it('HS 与申报要素严重缺项禁止申报', () => {
    const r = evaluateN8(
      baseSnap({
        customs: {
          hsCode: '8458.11.00',
          productName: '数控机床配件',
          declareElements: { 品牌: 'Beihai' },
          originEvidenceType: null,
          originEvidenceRef: null,
        },
        hsTemplate: baseSnap().hsTemplate,
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(['N8_DECLARE_ELEMENTS', 'N8_ORIGIN_EVIDENCE']));
  });

  it('无 HS 模板禁止申报', () => {
    const r = evaluateN8(
      baseSnap({
        customs: { ...baseSnap().customs!, hsCode: '9999.99.99' },
        hsTemplate: null,
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N8_HS_TEMPLATE');
  });

  it('品名与 HS 模板严重不符禁止申报', () => {
    const r = evaluateN8(
      baseSnap({
        customs: { ...baseSnap().customs!, productName: '新鲜苹果' },
      }),
    );
    expect(r.canProceed).toBe(false);
    expect(r.missing).toContain('N8_HS_PRODUCT_MISMATCH');
  });

  it('税则品名/计量单位不符仅软提示', () => {
    const r = evaluateN8(
      baseSnap({
        customs: { ...baseSnap().customs!, unit: '台', exportTaxName: '其他零件' },
      }),
    );
    expect(r.canProceed).toBe(true);
    expect(r.decision).toBe(Decision.SOFT_ALERT);
    expect(r.alerts.length).toBeGreaterThan(0);
  });

  it('要素齐全可通过', () => {
    expect(evaluateN8(baseSnap()).canProceed).toBe(true);
  });
});

describe('节点流转', () => {
  it('N3 之后无变更则跳过 N4', () => {
    expect(nextNode('N3', baseSnap({ changeOrders: [] }))).toBe('N5');
  });

  it('N3 之后有变更单则进入 N4', () => {
    expect(
      nextNode(
        'N3',
        baseSnap({
          changeOrders: [
            {
              id: 'ch1',
              changeNo: 'CO-001',
              version: 1,
              status: 'PENDING_ACK',
              isSensitive: false,
              customerAck: false,
              internalAck: false,
              approved: false,
              diffs: [],
            },
          ],
        }),
      ),
    ).toBe('N4');
  });

  it('全流程顺序 1→2→3→4→5→6→7→8→9', () => {
    expect(nextNode('N1')).toBe('N2');
    expect(nextNode('N2')).toBe('N3');
    expect(nextNode('N4')).toBe('N5');
    expect(nextNode('N5')).toBe('N6');
    expect(nextNode('N7')).toBe('N8');
    expect(nextNode('N8')).toBe('N9');
    expect(nextNode('N9')).toBeNull();
  });
});
