import {
  COMPARE_FIELDS,
  Decision,
  Disposition,
  DocType,
  FieldLabel,
  NodeStatus,
  PartyRole,
  PartyRoleLabel,
} from '../common/constants';
import { CaseSnapshot, GateResult } from '../common/types';

const HARD_GATES = new Set(['N6', 'N7', 'N9']);

export function emptyResult(nodeCode: string): GateResult {
  return {
    nodeCode,
    decision: Decision.PASS,
    canProceed: true,
    missing: [],
    reasons: [],
    alerts: [],
  };
}

export function evaluateNode(nodeCode: string, snap: CaseSnapshot): GateResult {
  switch (nodeCode) {
    case 'N1':
      return evaluateN1(snap);
    case 'N3':
      return evaluateN3(snap);
    case 'N6':
      return evaluateN6(snap);
    case 'N7':
      return evaluateN7(snap);
    case 'N9':
      return evaluateN9(snap);
    case 'N2':
    case 'N4':
    case 'N5':
    case 'N8':
      return {
        ...emptyResult(nodeCode),
        alerts: [`节点${nodeCode}为后续版本占位，本 MVP 不执行闸门。`],
      };
    default:
      return { ...emptyResult(nodeCode), canProceed: false, reasons: ['未知节点'] };
  }
}

export function evaluateN1(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N1');
  for (const role of [PartyRole.BUYER, PartyRole.PAYER, PartyRole.CONSIGNEE]) {
    if (!snap.parties.some((p) => p.role === role && p.name.trim())) {
      r.missing.push(`N1_PARTY_${role}`);
      r.reasons.push(`缺少当事方：${PartyRoleLabel[role]}`);
    }
  }
  if (!snap.kycRan) {
    r.missing.push('N1_SCREENING_NOT_RUN');
    r.reasons.push('尚未完成制裁/不可靠实体筛查');
  }

  const openHits = snap.hits.filter(
    (h) => h.disposition === Disposition.OPEN || h.disposition === Disposition.CONFIRMED_TRUE,
  );
  const high = openHits.filter((h) => h.riskLevel === 'HIGH' && h.confidence === 'HIGH');
  const confirmed = openHits.filter((h) => h.disposition === Disposition.CONFIRMED_TRUE);
  const medium = openHits.filter((h) => h.riskLevel === 'MEDIUM' || h.confidence === 'MEDIUM');
  const low = openHits.filter((h) => h.riskLevel === 'LOW' || h.confidence === 'LOW');

  if (high.length || confirmed.length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    r.missing.push('N1_HIGH_CONFIDENCE_HIT');
    r.reasons.push('高置信命中制裁/不可靠实体清单，硬拦截，禁止进入后续交易节点');
    return r;
  }
  if (r.missing.length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    return r;
  }
  if (medium.length) {
    r.decision = Decision.REVIEW;
    r.canProceed = false;
    r.missing.push('N1_REVIEW_PENDING');
    r.reasons.push('中风险命中，进入案例工作台审核队列，通过前不得推进');
    return r;
  }
  if (low.length) {
    r.decision = Decision.SOFT_ALERT;
    r.canProceed = true;
    r.alerts.push('低置信/低风险命中：软提示，不阻断业务，须保留审计痕迹');
    return r;
  }
  r.decision = Decision.PASS;
  r.canProceed = true;
  r.reasons.push('当事方齐全且筛查未命中阻断项');
  return r;
}

export function evaluateN3(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N3');
  const c = snap.contract;
  if (!c) {
    r.missing.push('N3_CONTRACT');
    r.reasons.push('尚未录入合同/订单确认信息');
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    return r;
  }
  if (!c.hasRetentionOfTitle) {
    r.missing.push('N3_RETENTION_OF_TITLE');
    r.reasons.push('缺少所有权保留条款（必填）');
  }
  if (!c.hasDisputeClause) {
    r.missing.push('N3_DISPUTE_CLAUSE');
    r.reasons.push('缺少争议解决条款（必填）');
  }
  if (!c.incoterms) {
    r.missing.push('N3_INCOTERMS');
    r.reasons.push('未填写国际贸易术语（Incoterms）');
  } else if (['EXW', 'DDP'].includes(c.incoterms.toUpperCase())) {
    r.alerts.push(`国际贸易术语 ${c.incoterms} 对出口方货权/清关责任不利，软提示关注`);
  }
  if (!c.paymentTerms) {
    r.missing.push('N3_PAYMENT_TERMS');
    r.reasons.push('未填写付款条件');
  } else if (/OA|开账|赊销/i.test(c.paymentTerms) && /90|120|180/.test(c.paymentTerms)) {
    r.alerts.push(`付款条件「${c.paymentTerms}」账期较长，软提示关注收汇风险`);
  }
  if (r.missing.length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    return r;
  }
  if (r.alerts.length) {
    r.decision = Decision.SOFT_ALERT;
    r.canProceed = true;
    return r;
  }
  r.reasons.push('所有权保留与争议条款齐全，贸易术语与付款条件已校验');
  return r;
}

export function evaluateN6(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N6');
  const s = snap.shipment;
  if (!s) {
    r.missing.push('N6_SHIPMENT');
    r.reasons.push('尚未录入装运/提单指示');
  } else {
    if (!s.hasCustomerWrittenInstruction || !s.instructionRef) {
      r.missing.push('N6_CUSTOMER_WRITTEN_INSTRUCTION');
      r.reasons.push('硬闸门：缺少客户书面提单指示');
    }
    if (!s.hasInternalApproval) {
      r.missing.push('N6_INTERNAL_APPROVAL');
      r.reasons.push('硬闸门：缺少内部审批');
    }
    if (!s.blControl) {
      r.missing.push('N6_BL_CONTROL');
      r.reasons.push('硬闸门：未明确提单控制方式（正本/电放）');
    }
  }
  return finalizeHard(r);
}

export function evaluateN7(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N7');
  const byType = Object.fromEntries(snap.documents.map((d) => [d.type, d]));
  const contractDoc = byType[DocType.CONTRACT];
  const invoice = byType[DocType.INVOICE];
  const packing = byType[DocType.PACKING];
  const bl = byType[DocType.BL];
  const finalContract = snap.contract?.isFinal || contractDoc?.isFinal;

  if (!finalContract) {
    r.missing.push('N7_FINAL_CONTRACT');
    r.reasons.push('硬闸门：缺少终稿合同');
  }
  if (!invoice) {
    r.missing.push('N7_INVOICE');
    r.reasons.push('硬闸门：缺少发票');
  }
  if (!packing) {
    r.missing.push('N7_PACKING');
    r.reasons.push('硬闸门：缺少装箱单');
  }
  if (!bl) {
    r.missing.push('N7_BL');
    r.reasons.push('硬闸门：缺少提单');
  }

  const docs = [contractDoc, invoice, packing, bl].filter(Boolean);
  const fixed = new Set(snap.mismatchFixes.map((f) => f.field));
  for (const field of COMPARE_FIELDS) {
    const values = docs
      .map((d) => d!.fields[field])
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
      .map((v) => String(v).trim().toUpperCase());
    if (values.length < 2) continue;
    const unique = new Set(values);
    if (unique.size > 1 && !fixed.has(field)) {
      r.missing.push(`N7_FIELD_MISMATCH_${field}`);
      r.reasons.push(
        `硬闸门：${FieldLabel[field] || field} 在合同/发票/装箱单/提单间不一致，且无不符点修改记录`,
      );
    }
  }
  return finalizeHard(r);
}

export function evaluateN9(snap: CaseSnapshot): GateResult {
  const r = emptyResult('N9');
  const n7 = snap.nodes.find((n) => n.code === 'N7');
  if (!n7 || n7.status !== NodeStatus.PASSED) {
    r.missing.push('N9_PREREQ_DOC_CONSISTENCY');
    r.reasons.push('硬闸门：单证一致性节点尚未通过，不能收汇放行');
  }
  const s = snap.settlement;
  if (!s) {
    r.missing.push('N9_SETTLEMENT');
    r.reasons.push('尚未录入收汇对账信息');
    return finalizeHard(r);
  }
  if (!s.hasRemittanceMemo || !s.remittanceMemoRef) {
    r.missing.push('N9_REMITTANCE_MEMO');
    r.reasons.push('硬闸门：缺少汇款附言/水单摘要');
  }
  if (!s.hasDocConsistencyProof) {
    r.missing.push('N9_DOC_CONSISTENCY_PROOF');
    r.reasons.push('硬闸门：缺少单证一致证明');
  }
  if (!s.hasReleaseApproval) {
    r.missing.push('N9_RELEASE_APPROVAL');
    r.reasons.push('硬闸门：缺少收汇放行审批');
  }
  const thirdParty = s.isThirdParty || namesDiffer(s.payerName, s.buyerName);
  if (thirdParty && !s.hasThirdPartyProof) {
    r.missing.push('N9_THIRD_PARTY_RELATION_PROOF');
    r.reasons.push('硬闸门：付款人与买方不一致，缺少第三方关系证明');
  }
  return finalizeHard(r);
}

function namesDiffer(a: string, b: string): boolean {
  return a.trim().toUpperCase() !== b.trim().toUpperCase();
}

function finalizeHard(r: GateResult): GateResult {
  if (r.missing.length) {
    r.decision = Decision.HARD_BLOCK;
    r.canProceed = false;
    if (HARD_GATES.has(r.nodeCode) && !r.reasons.some((x) => x.includes('证据缺失不得推进'))) {
      r.reasons.push('硬闸门未满足，拒绝推进至下一节点');
    }
  } else {
    r.decision = r.alerts.length ? Decision.SOFT_ALERT : Decision.PASS;
    r.canProceed = true;
    if (!r.reasons.length) r.reasons.push('硬闸门证据齐全，允许推进');
  }
  return r;
}

export function nextMvpNode(current: string): string | null {
  const order = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9'];
  const i = order.indexOf(current);
  if (i < 0 || i === order.length - 1) return null;
  return order[i + 1];
}
