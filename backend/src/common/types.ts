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
  amountFen?: number | null;
  currency?: string | null;
  destination?: string | null;
  deliveryDate?: string | Date | null;
  quantity?: number | null;
  unit?: string | null;
  paymentDueAt?: string | Date | null;
}

export interface ShipmentSnap {
  hasCustomerWrittenInstruction: boolean;
  instructionRef?: string | null;
  hasInternalApproval: boolean;
  blControl?: string | null;
  blNo?: string | null;
  consigneeOnBl?: string | null;
  /** 无提单路径的原因说明 */
  noBlReason?: string | null;
  /** 装船通知 / 订舱 / 买方运输安排编号 */
  noBlRef?: string | null;
  /** 演示上传占位（文件名或附件编号） */
  noBlEvidenceStub?: string | null;
  /** N6 手工覆盖合同贸易术语；空则沿用 N3 contract.incoterms */
  incotermsOverride?: string | null;
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
  quantity?: number | null;
  amountFen?: number | null;
  notes?: string | null;
  abnormalPriceNote?: string | null;
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

export interface ProcurementPlanSnap {
  poNo?: string | null;
  plannedArrival?: string | Date | null;
  contractDelivery?: string | Date | null;
  poEvidenceStub?: string | null;
  poEvidenceId?: string | null;
  delayRegistered: boolean;
  delayTriggerCode?: string | null;
  delayTriggerRef?: string | null;
  delayReason?: string | null;
  customerConsent: boolean;
  customerConsentEvidenceId?: string | null;
  actualArrival?: string | Date | null;
  amountFen?: number | null;
  currency?: string | null;
  paidFen?: number | null;
  paymentDueAt?: string | Date | null;
  paidAt?: string | Date | null;
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
}

export interface GateResult {
  nodeCode: string;
  decision: 'PASS' | 'SOFT_ALERT' | 'REVIEW' | 'HARD_BLOCK';
  canProceed: boolean;
  missing: string[];
  reasons: string[];
  alerts: string[];
}
