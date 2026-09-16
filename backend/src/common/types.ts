export interface PartySnap {
  id?: string;
  role: string;
  name: string;
  nameEn?: string | null;
  country?: string | null;
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
}

export interface ShipmentSnap {
  hasCustomerWrittenInstruction: boolean;
  instructionRef?: string | null;
  hasInternalApproval: boolean;
  blControl?: string | null;
  blNo?: string | null;
  consigneeOnBl?: string | null;
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
}

export interface NodeSnap {
  code: string;
  status: string;
  decision?: string | null;
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
}

export interface GateResult {
  nodeCode: string;
  decision: 'PASS' | 'SOFT_ALERT' | 'REVIEW' | 'HARD_BLOCK';
  canProceed: boolean;
  missing: string[];
  reasons: string[];
  alerts: string[];
}
