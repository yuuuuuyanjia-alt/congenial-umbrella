import { Decision } from '../common/constants';
import { CaseSnapshot } from '../common/types';
import { evaluateN1, evaluateN3, evaluateN6, evaluateN7, evaluateN9 } from './gate.engine';

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
