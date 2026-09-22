export interface PartySnap {
  id?: string;
  role: string;
  name: string;
  nameEn?: string | null;
  country?: string | null;
  address?: string | null;
  registrationNo?: string | null;
  isSameAsBuyer?: boolean;
}

export interface HitSnap {
  listCode: string;
  listedName: string;
  matchedName: string;
  confidence: string;
  riskLevel: string;
  disposition: string;
  score: number;
  partyRole?: string | null;
  nodeCode?: string | null;
}

export interface ContractSnap {
  incoterms?: string | null;
  paymentTerms?: string | null;
  hasRetentionOfTitle: boolean;
  hasDisputeClause: boolean;
  isFinal: boolean;
  buyerName?: string | null;
  consigneeName?: string | null;
  goodsDesc?: string | null;
  goodsSpec?: string | null;
  amountFen?: number | null;
  currency?: string | null;
  destination?: string | null;
  deliveryDate?: string | Date | null;
  quantity?: number | null;
  unit?: string | null;
  paymentDueAt?: string | Date | null;
  shipmentPort?: string | null;
  shipmentDate?: string | Date | null;
  domesticPortArrivalAt?: string | Date | null;
  etaDate?: string | Date | null;
  arrivalPort?: string | null;
  /** 销售合同装运港，与 CIF/N6 shipmentPort 分开 */
  loadingPort?: string | null;
  /** 销售合同装运期限（日期或文本） */
  shipmentDeadline?: string | null;
  customerPickedUp?: boolean | null;
  hasRemittance?: boolean | null;
  remittedFen?: number | null;
  ttTiming?: string | null;
  ttPercentBps?: number | null;
  ttAdvanceFen?: number | null;
  ttDaysAfterShipment?: number | null;
  deliveryMode?: string | null;
  directPort?: DirectPortSnap | null;
  ttVouchers?: Array<{ ref: string; fileName?: string | null }> | null;
}

export interface DirectPortSnap {
  warehouseLocation?: string | null;
  batchNo?: string | null;
  goodsWhereAnswer?: string | null;
  goodsWhereRef?: string | null;
  customsPartyAnswer?: string | null;
  remittanceBoundAnswer?: string | null;
  remittanceBoundRef?: string | null;
  emptyTurnLikely?: boolean | null;
  emptyTurnAnswer?: string | null;
  emptyTurnRef?: string | null;
}

export interface ShipmentSnap {
  /** 历史字段。N6 闸门已改为发票 + 箱单，不再读取。 */
  hasCustomerWrittenInstruction?: boolean;
  instructionRef?: string | null;
  hasInternalApproval: boolean;
  blControl?: string | null;
  blNo?: string | null;
  consigneeOnBl?: string | null;
  /** 无提单路径的原因说明 */
  noBlReason?: string | null;
  /** 装船通知 / 订舱 / 买方运输安排编号（历史字段；页面已不再采集） */
  noBlRef?: string | null;
  /** 演示上传占位（文件名或附件编号） */
  noBlEvidenceStub?: string | null;
  /** N6 手工覆盖合同运输术语；空则沿用 N3 contract.incoterms。不得写入 T/T */
  incotermsOverride?: string | null;
  /** 发票上传写入证据链后的 Evidence.id */
  invoiceEvidenceId?: string | null;
  /** 箱单上传写入证据链后的 Evidence.id */
  packingEvidenceId?: string | null;
}

export interface DocSnap {
  type: string;
  isFinal: boolean;
  fields: Record<string, string | number | null | undefined>;
}

export interface FixSnap {
  field: string;
  fromValue: string;
  toValue: string;
  reason: string;
}

export interface SettlementSnap {
  payerName: string;
  buyerName: string;
  isThirdParty: boolean;
  hasThirdPartyProof: boolean;
  hasRemittanceMemo: boolean;
  remittanceMemoRef?: string | null;
  hasDocConsistencyProof: boolean;
  hasReleaseApproval: boolean;
  amountFen?: number | null;
  receivedAt?: string | Date | null;
}

export interface NodeSnap {
  code: string;
  status: string;
  decision?: string | null;
}

export interface QuoteSnap {
  version: number;
  status: string;
  priceBasis: string;
  includedItems?: string | null;
  excludedItems?: string | null;
  validityUntil?: string | Date | null;
  freightBearer?: string | null;
  taxBearer?: string | null;
  unitPriceFen?: number | null;
  unit?: string | null;
  quantity?: number | null;
  amountFen?: number | null;
  notes?: string | null;
  abnormalPriceNote?: string | null;
  goodsDesc?: string | null;
  goodsSpec?: string | null;
}

export interface ChangeDiffSnap {
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
}

export interface ChangeOrderSnap {
  id: string;
  changeNo: string;
  version: number;
  status: string;
  reason?: string | null;
  isSensitive: boolean;
  customerAck: boolean;
  customerAckRef?: string | null;
  customerAckEvidenceId?: string | null;
  internalAck: boolean;
  internalAckEvidenceId?: string | null;
  approved: boolean;
  approvalEvidenceId?: string | null;
  diffs: ChangeDiffSnap[];
}

export interface SinosurePolicySnap {
  id?: string;
  nodeCode: string;
  changeOrderId?: string | null;
  evidenceId?: string | null;
  evidenceRef?: string | null;
  fileName?: string | null;
  insuredLimitFen: number;
  currency: string;
  confirmedExisting?: boolean;
}

export interface SinosureOccupancySnap {
  openUnpaidFen: number;
  fulfilledUnpaidFen: number;
}

export interface SinosureExposureSnap {
  currency: string;
  limitCurrency: string | null;
  insuredLimitFen: number | null;
  openUnpaidFen: number;
  fulfilledUnpaidFen: number;
  newContractFen: number;
  occupancyFen: number;
  remainingFen: number;
  excessFen: number;
  band: string | null;
  bandLabel: string;
  gateDecision: string | null;
  gateLabel: string;
  usdBandsApply: boolean;
  currencyOk: boolean;
  formula: string;
  summary: string;
  notes: string[];
}

export interface ProcurementPlanSnap {
  poNo?: string | null;
  /** 供应商实际交付日期（计划交付） */
  plannedArrival?: string | Date | null;
  /** 对照用：关联销售合同交货期 */
  contractDelivery?: string | Date | null;
  /** 本采购合同服务的销售/出口案件 id */
  salesCaseId?: string | null;
  salesCaseNo?: string | null;
  /** 关联销售案件是否已签销售合同（N3 已通过，或已过 N3 且有合同） */
  salesContractSigned?: boolean;
  poEvidenceStub?: string | null;
  poEvidenceId?: string | null;
  delayRegistered: boolean;
  delayTriggerCode?: string | null;
  delayTriggerRef?: string | null;
  delayReason?: string | null;
  customerConsent: boolean;
  customerConsentEvidenceId?: string | null;
  /** 实际交付日期；闸门与供应商实际交付日期任一对照关联销售合同交货期 */
  actualArrival?: string | Date | null;
  amountFen?: number | null;
  currency?: string | null;
  paidFen?: number | null;
  paymentDueAt?: string | Date | null;
  paidAt?: string | Date | null;
  paymentMode?: string | null;
}

export interface HsTemplateSnap {
  hsCode: string;
  productName: string;
  requiredElements: string[];
  unit: string;
  exportTaxName: string;
}

export interface CustomsSnap {
  hsCode?: string | null;
  productName?: string | null;
  declareElements: Record<string, string>;
  originCountry?: string | null;
  originEvidenceType?: string | null;
  originEvidenceRef?: string | null;
  originEvidenceId?: string | null;
  unit?: string | null;
  exportTaxName?: string | null;
  eportStatus?: string | null;
}

export interface CaseSnapshot {
  parties: PartySnap[];
  hits: HitSnap[];
  kycRan: boolean;
  contract?: ContractSnap | null;
  shipment?: ShipmentSnap | null;
  documents: DocSnap[];
  mismatchFixes: FixSnap[];
  settlement?: SettlementSnap | null;
  nodes: NodeSnap[];
  quotes: QuoteSnap[];
  changeOrders: ChangeOrderSnap[];
  procurementPlan?: ProcurementPlanSnap | null;
  supplierScreened?: boolean;
  customs?: CustomsSnap | null;
  hsTemplate?: HsTemplateSnap | null;
  costFloorFen?: number | null;
  historyUnitPrices: number[];
  now?: string | Date;
  caseAmountFen?: number | null;
  caseCurrency?: string | null;
  sinosurePolicies: SinosurePolicySnap[];
  /** 买方其余合同未回款（不含本笔新签金额） */
  sinosureOccupancy?: SinosureOccupancySnap | null;
  /** 中信保占用高风险工作台审核（领取 / 放行 / 驳回） */
  occupancyReviews?: OccupancyReviewSnap[] | null;
  /** 关联销售合同（N5）或本案销售合同，供 FT1 购销匹配 / 交货方式只读同步 */
  salesContract?: SalesContractSideSnap | null;
  /** 本案货物描述，供购销货描比对 */
  caseGoodsDesc?: string | null;
  taxFinanceReviews?: TaxFinanceReviewSnap[] | null;
  taxRebate?: TaxRebateSnap | null;
}

export interface SalesContractSideSnap {
  deliveryMode?: string | null;
  goodsDesc?: string | null;
  goodsSpec?: string | null;
  amountFen?: number | null;
  quantity?: number | null;
  currency?: string | null;
  directPort?: DirectPortSnap | null;
  consigneeName?: string | null;
  buyerName?: string | null;
}

export interface TaxFinanceReviewSnap {
  id?: string;
  nodeCode: string;
  status: string;
  band?: string | null;
  reasonCode?: string | null;
  summary?: string | null;
  fingerprint?: string | null;
  claimedById?: string | null;
  comment?: string | null;
}

export interface TaxRebateSnap {
  inputInvoiceNo?: string | null;
  flowGoods?: boolean | null;
  flowCustoms?: boolean | null;
  flowInvoice?: boolean | null;
  flowRemittance?: boolean | null;
  declaredAt?: string | Date | null;
}

export interface TaxFinanceView {
  band: 'YELLOW' | 'RED' | null;
  reasonCode: string;
  fingerprint: string;
  summary: string;
  marginBps: number | null;
  deliveryMode: string | null;
  directPortComplete: boolean;
}

export interface OccupancyReviewSnap {
  id?: string;
  nodeCode: string;
  status: string;
  band?: string | null;
  occupancyFen: number;
  excessFen: number;
  insuredLimitFen: number;
  fingerprint?: string | null;
  claimedById?: string | null;
  comment?: string | null;
}

export interface GateResult {
  nodeCode: string;
  decision: 'PASS' | 'SOFT_ALERT' | 'REVIEW' | 'HARD_BLOCK';
  canProceed: boolean;
  missing: string[];
  reasons: string[];
  alerts: string[];
  exposure?: SinosureExposureSnap;
  taxFinance?: TaxFinanceView;
}
