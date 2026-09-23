import { Decision, NodeStatus } from '../common/constants';
import { CaseSnapshot, EvidenceFileSnap } from '../common/types';
import { evaluateBuyerOccupancy } from '../customers/sinosure-exposure';
import { evaluateN6, evaluateN7, evaluateN9 } from '../gates/gate.engine';
import { resolveAdvance } from './advance-guard';
import {
  batchCountsAsShipped,
  contractOccupancyPortions,
  describeDefaultBatch,
  evidencesForBatch,
  rollupCaseShipping,
} from './shipment-batch';

function file(kind: string, nodeCode: string, batchId: string): EvidenceFileSnap & { batchId: string } {
  return {
    id: `${batchId}-${kind}`,
    nodeCode,
    kind,
    batchId,
    fileName: `${kind}.pdf`,
    storageKey: `trade-docs/${batchId}/${kind}.pdf`,
  };
}

const N7_CORE = [
  'N7_SALES_CONTRACT',
  'N7_COMMERCIAL_INVOICE',
  'N7_PACKING',
  'N7_PURCHASE_CONTRACT',
  'N7_INVOICE',
  'N7_CUSTOMS',
];

function snap(over: Partial<CaseSnapshot>): CaseSnapshot {
  return {
    parties: [{ role: 'BUYER', name: 'Nordlicht GmbH' }],
    hits: [],
    kycRan: true,
    contract: {
      incoterms: 'CIF',
      paymentTerms: '后 T/T 30 days',
      hasRetentionOfTitle: true,
      hasDisputeClause: true,
      isFinal: true,
      ttTiming: 'AFTER',
    },
    shipment: {
      hasCustomerWrittenInstruction: false,
      hasInternalApproval: true,
      blControl: 'ORIGINAL',
      blNo: 'BL-1',
    },
    documents: [],
    mismatchFixes: [],
    settlement: null,
    nodes: [
      { code: 'N6', status: NodeStatus.PASSED },
      { code: 'N7', status: NodeStatus.PASSED },
    ],
    quotes: [],
    changeOrders: [],
    historyUnitPrices: [],
    sinosurePolicies: [],
    evidences: [],
    ...over,
  };
}

describe('ShipmentBatch', () => {
  it('迁移默认批次：已完成案件为 DONE，未装运案件停在 N6 且不把 N6 标成已过', () => {
    const done = describeDefaultBatch({
      status: 'COMPLETED',
      currentNode: 'N9',
      nodes: [
        { code: 'N6', status: NodeStatus.PASSED },
        { code: 'N7', status: NodeStatus.PASSED },
        { code: 'N9', status: NodeStatus.PASSED },
      ],
    });
    expect(done.currentNode).toBe('DONE');
    expect(done.nodes.find((n) => n.code === 'N6')?.status).toBe(NodeStatus.PASSED);

    const wip = describeDefaultBatch({
      status: 'IN_PROGRESS',
      currentNode: 'N5',
      nodes: [
        { code: 'N6', status: NodeStatus.NOT_STARTED },
        { code: 'N7', status: NodeStatus.NOT_STARTED },
        { code: 'N9', status: NodeStatus.NOT_STARTED },
      ],
    });
    expect(wip.currentNode).toBe('N6');
    expect(wip.status).toBe(NodeStatus.NOT_STARTED);
    expect(wip.nodes.every((n) => n.status === NodeStatus.NOT_STARTED)).toBe(true);
  });

  it('两批同时在途：各自可推进，不要求另一批先完成', () => {
    const ahead = resolveAdvance({
      currentNode: 'N7',
      requestedNode: 'N7',
      requestedStatus: NodeStatus.IN_PROGRESS,
    });
    const behind = resolveAdvance({
      currentNode: 'N6',
      requestedNode: 'N6',
      requestedStatus: NodeStatus.IN_PROGRESS,
    });
    expect(ahead.kind).toBe('allow');
    expect(behind.kind).toBe('allow');

    const rolled = rollupCaseShipping({
      caseCurrentNode: 'N6',
      caseStatus: 'IN_PROGRESS',
      batches: [
        { currentNode: 'N7', nodes: [{ code: 'N6', status: NodeStatus.PASSED }, { code: 'N7', status: NodeStatus.IN_PROGRESS }, { code: 'N9', status: NodeStatus.NOT_STARTED }] },
        { currentNode: 'N6', nodes: [{ code: 'N6', status: NodeStatus.IN_PROGRESS }, { code: 'N7', status: NodeStatus.NOT_STARTED }, { code: 'N9', status: NodeStatus.NOT_STARTED }] },
      ],
    });
    expect(rolled.apply).toBe(true);
    expect(rolled.status).not.toBe('COMPLETED');
    expect(rolled.currentNode).toBe('N6');
    expect(rolled.nodes.find((n) => n.code === 'N6')?.status).not.toBe(NodeStatus.PASSED);
  });

  it('占用 = 已出运批次未回款 + 未出运合同余额，且单批默认口径不变', () => {
    const bothInTransit = contractOccupancyPortions({
      amountFen: 1_000_000,
      batches: [
        { amountFen: 400_000, receivedFen: 0, shipped: true },
        { amountFen: 600_000, receivedFen: 0, shipped: true },
      ],
    });
    expect(bothInTransit.unpaidRemittanceFen).toBe(1_000_000);
    expect(bothInTransit.unshippedBalanceFen).toBe(0);
    expect(bothInTransit.openUnpaidFen + bothInTransit.fulfilledUnpaidFen).toBe(1_000_000);
    expect(bothInTransit.fulfilledUnpaidFen).toBe(1_000_000);

    const partial = contractOccupancyPortions({
      amountFen: 1_000_000,
      batches: [
        { amountFen: 400_000, receivedFen: 100_000, shipped: true },
        { amountFen: 600_000, receivedFen: 0, shipped: false },
      ],
    });
    expect(partial.unpaidRemittanceFen).toBe(300_000);
    expect(partial.unshippedBalanceFen).toBe(600_000);
    expect(partial.fulfilledUnpaidFen).toBe(300_000);
    expect(partial.openUnpaidFen).toBe(600_000);

    const soleOpen = contractOccupancyPortions({
      amountFen: 1_800_000,
      batches: [{ amountFen: 1_800_000, receivedFen: 0, shipped: false }],
    });
    expect(soleOpen.openUnpaidFen).toBe(1_800_000);
    expect(soleOpen.fulfilledUnpaidFen).toBe(0);

    const soleShipped = contractOccupancyPortions({
      amountFen: 4_500_000,
      batches: [{ amountFen: 4_500_000, receivedFen: 2_000_000, shipped: true }],
    });
    expect(soleShipped.fulfilledUnpaidFen).toBe(2_500_000);
    expect(soleShipped.openUnpaidFen).toBe(0);

    const pooled = evaluateBuyerOccupancy(
      [
        {
          id: 'split',
          caseNo: 'SPLIT',
          hasContract: true,
          amountFen: 1_000_000,
          currency: 'USD',
          receivedFen: 100_000,
          batchSplit: true,
          openUnpaidFen: partial.openUnpaidFen,
          fulfilledUnpaidFen: partial.fulfilledUnpaidFen,
        },
        {
          id: 'cny',
          caseNo: 'CNY-1',
          hasContract: true,
          amountFen: 9_000_000,
          currency: 'CNY',
          receivedFen: 0,
          batchSplit: true,
          openUnpaidFen: 9_000_000,
          fulfilledUnpaidFen: 0,
        },
      ],
      { insuredLimitFen: 5_000_000, limitCurrency: 'USD' },
    );
    expect(pooled.occupancyFen).toBe(900_000);
    expect(pooled.excludedNonUsd.map((row) => row.caseNo)).toContain('CNY-1');
  });

  it('FOB/CIF 单证规则按批次证据生效，另一批的原产地证不能顶上', () => {
    const batchA = 'batch-a';
    const batchB = 'batch-b';
    const shared = [
      ...['N6_INVOICE', 'N6_PACKING'].map((kind) => file(kind, 'N6', batchA)),
      ...['N6_INVOICE', 'N6_PACKING'].map((kind) => file(kind, 'N6', batchB)),
      ...N7_CORE.map((kind) => file(kind, 'N7', batchA)),
      ...N7_CORE.map((kind) => file(kind, 'N7', batchB)),
      file('N7_ORIGIN_CERT', 'N7', batchA),
    ];

    const cifShipped = evaluateN6(
      snap({
        evidences: evidencesForBatch(shared, batchA),
        shipment: { hasCustomerWrittenInstruction: false, hasInternalApproval: true, blControl: 'ORIGINAL' },
      }),
    );
    expect(cifShipped.canProceed).toBe(true);

    const fobMissingPath = evaluateN6(
      snap({
        contract: {
          incoterms: 'FOB',
          hasRetentionOfTitle: true,
          hasDisputeClause: true,
          isFinal: true,
        },
        shipment: { hasCustomerWrittenInstruction: false, hasInternalApproval: true, blControl: 'NO_BL' },
        evidences: evidencesForBatch(shared, batchB),
      }),
    );
    expect(fobMissingPath.canProceed).toBe(true);
    expect(fobMissingPath.missing).not.toContain('N6_BL_CONTROL');

    const fobDocs = evaluateN7(
      snap({
        contract: { incoterms: 'FOB', hasRetentionOfTitle: true, hasDisputeClause: true, isFinal: true },
        shipment: { hasCustomerWrittenInstruction: false, hasInternalApproval: true, blControl: 'NO_BL' },
        evidences: evidencesForBatch(shared, batchB),
        nodes: [{ code: 'N7', status: NodeStatus.IN_PROGRESS }],
      }),
    );
    expect(fobDocs.canProceed).toBe(true);
    expect(fobDocs.missing).not.toContain('N7_ORIGIN_CERT');

    const cifWithoutOwnOrigin = evaluateN7(
      snap({
        evidences: evidencesForBatch(
          shared.filter((row) => row.kind !== 'N7_ORIGIN_CERT'),
          batchA,
        ),
      }),
    );
    expect(cifWithoutOwnOrigin.canProceed).toBe(false);
    expect(cifWithoutOwnOrigin.missing).toContain('N7_ORIGIN_CERT');
    expect(cifWithoutOwnOrigin.decision).toBe(Decision.HARD_BLOCK);

    const cifWithOwnOrigin = evaluateN7(snap({ evidences: evidencesForBatch(shared, batchA) }));
    expect(cifWithOwnOrigin.canProceed).toBe(true);

    const n9 = evaluateN9(
      snap({
        nodes: [{ code: 'N7', status: NodeStatus.NOT_STARTED }],
        settlement: {
          payerName: 'Nordlicht GmbH',
          buyerName: 'Nordlicht GmbH',
          isThirdParty: false,
          hasThirdPartyProof: false,
          hasRemittanceMemo: true,
          remittanceMemoRef: 'SWIFT-B',
          hasDocConsistencyProof: true,
          hasReleaseApproval: true,
        },
      }),
    );
    expect(n9.canProceed).toBe(false);
    expect(n9.missing).toContain('N9_PREREQ_DOC_CONSISTENCY');
  });

  it('未过 N6 的批次不算已出运', () => {
    expect(
      batchCountsAsShipped({
        currentNode: 'N6',
        nodes: [{ code: 'N6', status: NodeStatus.NOT_STARTED }],
      }),
    ).toBe(false);
    expect(
      batchCountsAsShipped({
        currentNode: 'N7',
        nodes: [{ code: 'N6', status: NodeStatus.PASSED }],
      }),
    ).toBe(true);
  });
});
