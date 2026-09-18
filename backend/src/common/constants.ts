/** 节点目录：询盘 → 收汇 九节点全量。N4 无待确认变更时可直接过闸。 */
export const NODE_CATALOG = [
  {
    code: 'N1',
    name: '询盘/客户KYC',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: '买方/付款人/收货人关系确认，制裁与不可靠实体筛查，生成KYC报告与风险评分。',
  },
  {
    code: 'N2',
    name: '报价环节',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: '价格基础（含/不含项目）、有效期、运费/税费承担方必填；模糊报价不得推进；异常偏离成本底线/历史价软提示或中风险。',
  },
  {
    code: 'N3',
    name: '销售合同/订单确认',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: '销售/出口合同与采购合同分开签订。所有权保留与争议解决条款必填；中信保限额未登记不得签订销售合同；须上传保单并登记投保限额；按买方占用测算（未履行完毕未回款+已履行完毕未回款+新签合同），超额分档提示或拦截。',
  },
  {
    code: 'N4',
    name: '变更管理',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: '交货期/数量/收货人/付款条件变更须出变更单（含 diff），客户与内部确认后生效；进入变更时须再次确认中信保，并按变更后金额重算买方占用。',
  },
  {
    code: 'N5',
    name: '采购合同/国内备货',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: '采购合同与销售合同分开签订。公司惯例先销售后采购：须关联一笔已达 N3 且已签的销售/出口合同，否则不得保存或推进；登记国内供应商、采购合同/PO 与计划到货；供应商须过制裁/不可靠实体筛查；计划到货不得晚于客户合同交期，除非已登记结构化延期并保留客户同意证据。',
  },
  {
    code: 'N6',
    name: '装运/提单指示',
    mvp: true,
    isHardGate: true,
    isStub: false,
    summary: '硬闸门：客户书面指示 + 内部审批；CIF/CFR 等须正本或电放其一；FOB/EXW/FAS/FCA 可走无提单路径。',
  },
  {
    code: 'N7',
    name: '单证一致性',
    mvp: true,
    isHardGate: true,
    isStub: false,
    summary: '硬闸门：终稿合同 + 合同/发票/装箱单/提单字段一致 + 不符点修改记录。',
  },
  {
    code: 'N8',
    name: '报关放行',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: 'HS 编码与申报要素模板核对、原产地证据；税则品名/计量单位不符软提示；严重缺项禁止申报。',
  },
  {
    code: 'N9',
    name: '收汇对账',
    mvp: true,
    isHardGate: true,
    isStub: false,
    summary: '硬闸门：第三方关系证明 + 汇款附言 + 单证一致证明 + 放行审批。',
  },
] as const;

export type NodeCode = (typeof NODE_CATALOG)[number]['code'];

export const NODE_FLOW: NodeCode[] = NODE_CATALOG.map((n) => n.code);

export const PartyRole = {
  BUYER: 'BUYER',
  PAYER: 'PAYER',
  CONSIGNEE: 'CONSIGNEE',
  SUPPLIER: 'SUPPLIER',
} as const;

export const PartyRoleLabel: Record<string, string> = {
  BUYER: '买方',
  PAYER: '付款人',
  CONSIGNEE: '收货人',
  SUPPLIER: '国内供应商',
};

export const CUSTOMER_PARTY_ROLES = [PartyRole.BUYER, PartyRole.PAYER, PartyRole.CONSIGNEE] as const;

export const ListCode = {
  OFAC: 'OFAC',
  UN: 'UN',
  EU: 'EU',
  UK: 'UK',
  CN_UNRELIABLE: 'CN_UNRELIABLE',
} as const;

export const ListCodeLabel: Record<string, string> = {
  OFAC: 'OFAC（美国）',
  UN: '联合国制裁清单',
  EU: '欧盟制裁清单',
  UK: '英国OFSI清单',
  CN_UNRELIABLE: '中国不可靠实体清单',
};

export const Confidence = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export const ConfidenceLabel: Record<string, string> = {
  HIGH: '高置信',
  MEDIUM: '中置信',
  LOW: '低置信',
};

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;

export const RiskLevelLabel: Record<string, string> = {
  LOW: '低风险（软提示）',
  MEDIUM: '中风险（审核队列）',
  HIGH: '高风险（硬拦截）',
};

export const Decision = {
  PASS: 'PASS',
  SOFT_ALERT: 'SOFT_ALERT',
  REVIEW: 'REVIEW',
  HARD_BLOCK: 'HARD_BLOCK',
} as const;

export const DecisionLabel: Record<string, string> = {
  PASS: '通过',
  SOFT_ALERT: '软提示',
  REVIEW: '审核队列',
  HARD_BLOCK: '硬拦截',
};

export const NodeStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  PASSED: 'PASSED',
  BLOCKED: 'BLOCKED',
  REVIEW: 'REVIEW',
  STUB_TODO: 'STUB_TODO',
} as const;

export const CaseStatus = {
  DRAFT: 'DRAFT',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
  COMPLETED: 'COMPLETED',
} as const;

export const CaseStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  IN_PROGRESS: '进行中',
  BLOCKED: '已拦截',
  COMPLETED: '已完成',
};

export const Disposition = {
  OPEN: 'OPEN',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  CONFIRMED_TRUE: 'CONFIRMED_TRUE',
  SUPPLEMENTED: 'SUPPLEMENTED',
  MONITORING: 'MONITORING',
} as const;

export const WorkbenchActionType = {
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  CONFIRM_TRUE: 'CONFIRM_TRUE',
  SUPPLEMENT: 'SUPPLEMENT',
  MONITOR: 'MONITOR',
} as const;

export const WorkbenchActionLabel: Record<string, string> = {
  FALSE_POSITIVE: '误报排除',
  CONFIRM_TRUE: '确认真实',
  SUPPLEMENT: '补充信息',
  MONITOR: '持续监控',
};

export const BlControl = {
  ORIGINAL: 'ORIGINAL',
  TELEX_RELEASE: 'TELEX_RELEASE',
  NO_BL: 'NO_BL',
  FOB_NO_BL: 'FOB_NO_BL',
} as const;

export const BlControlLabel: Record<string, string> = {
  ORIGINAL: '正本提单',
  TELEX_RELEASE: '电放提单',
  NO_BL: '无提单',
  FOB_NO_BL: '无提单（FOB）',
};

/**
 * 买方安排主运、卖方通常不控提单的贸易术语。
 * FOB 为主场景；EXW / FAS / FCA 一并纳入无提单可选路径（与 CIF/CFR 等卖方出单相对）。
 */
export const BUYER_ARRANGED_FREIGHT_INCOTERMS = ['FOB', 'EXW', 'FAS', 'FCA'] as const;

export const DocType = {
  CONTRACT: 'CONTRACT',
  INVOICE: 'INVOICE',
  PACKING: 'PACKING',
  BL: 'BL',
} as const;

export const DocTypeLabel: Record<string, string> = {
  CONTRACT: '合同',
  INVOICE: '发票',
  PACKING: '装箱单',
  BL: '提单',
};

export const UserRole = {
  SALES: 'SALES',
  COMPLIANCE: 'COMPLIANCE',
  APPROVER: 'APPROVER',
  FINANCE: 'FINANCE',
} as const;

export const COMPARE_FIELDS = [
  'buyerName',
  'consigneeName',
  'goodsDesc',
  'amountFen',
  'currency',
  'incoterms',
] as const;

export const FieldLabel: Record<string, string> = {
  buyerName: '买方名称',
  consigneeName: '收货人',
  goodsDesc: '货物描述',
  amountFen: '金额',
  currency: '币种',
  incoterms: '国际贸易术语',
};

export const PriceBasis = {
  INCLUSIVE: 'INCLUSIVE',
  EXCLUSIVE: 'EXCLUSIVE',
  MIXED: 'MIXED',
} as const;

export const PriceBasisLabel: Record<string, string> = {
  INCLUSIVE: '含项目（列明包含）',
  EXCLUSIVE: '不含项目（列明排除）',
  MIXED: '部分含/不含',
};

export const Bearer = {
  SELLER: 'SELLER',
  BUYER: 'BUYER',
} as const;

export const BearerLabel: Record<string, string> = {
  SELLER: '卖方承担',
  BUYER: '买方承担',
};

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export const VersionStatus = {
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export const ChangeStatus = {
  DRAFT: 'DRAFT',
  PENDING_ACK: 'PENDING_ACK',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPLIED: 'APPLIED',
  SUPERSEDED: 'SUPERSEDED',
} as const;

export const ChangeStatusLabel: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_ACK: '待确认',
  PENDING_APPROVAL: '待审批',
  APPLIED: '已生效',
  SUPERSEDED: '已废止',
};

export const CHANGE_FIELDS = [
  'deliveryDate',
  'quantity',
  'consigneeName',
  'paymentTerms',
  'payerName',
  'buyerName',
] as const;

export const ChangeFieldLabel: Record<string, string> = {
  deliveryDate: '交货期',
  quantity: '数量',
  consigneeName: '收货人',
  paymentTerms: '付款条件',
  payerName: '付款人',
  buyerName: '买方',
};

export const SENSITIVE_CHANGE_FIELDS = new Set([
  'consigneeName',
  'paymentTerms',
  'payerName',
  'buyerName',
]);

export const DelayTrigger = {
  FORCE_MAJEURE: 'FORCE_MAJEURE',
  PORT_CONGESTION: 'PORT_CONGESTION',
  MATERIAL_SHORTAGE: 'MATERIAL_SHORTAGE',
  CAPACITY: 'CAPACITY',
  CUSTOMER_REQUEST: 'CUSTOMER_REQUEST',
  LOGISTICS: 'LOGISTICS',
} as const;

export const DelayTriggerLabel: Record<string, string> = {
  FORCE_MAJEURE: '不可抗力',
  PORT_CONGESTION: '港口拥堵',
  MATERIAL_SHORTAGE: '原料短缺',
  CAPACITY: '供应商交期不足',
  CUSTOMER_REQUEST: '客户要求变更交期',
  LOGISTICS: '物流运力不足',
};

export const OriginEvidenceType = {
  CO: 'CO',
  FORM_E: 'FORM_E',
  FORM_A: 'FORM_A',
  DECLARATION: 'DECLARATION',
} as const;

export const OriginEvidenceLabel: Record<string, string> = {
  CO: '原产地证书 CO',
  FORM_E: 'FORM E',
  FORM_A: 'FORM A',
  DECLARATION: '原产地声明',
};

export const EportStatus = {
  NOT_SYNCED: 'NOT_SYNCED',
  DECLARED: 'DECLARED',
  RELEASED: 'RELEASED',
  HELD: 'HELD',
} as const;

export const EportStatusLabel: Record<string, string> = {
  NOT_SYNCED: '未同步',
  DECLARED: '已申报',
  RELEASED: '已放行',
  HELD: '海关扣留/退单',
};

export const PaymentMode = {
  FULL: 'FULL',
  STAGED: 'STAGED',
} as const;

export const PaymentModeLabel: Record<string, string> = {
  FULL: '一次性付清',
  STAGED: '分期支付',
};

export const InstallmentStatus = {
  PAID: 'PAID',
  ON_TIME: 'ON_TIME',
  OVERDUE: 'OVERDUE',
  NOT_DUE: 'NOT_DUE',
} as const;

export const InstallmentStatusLabel: Record<string, string> = {
  PAID: '已付清',
  ON_TIME: '按期',
  OVERDUE: '逾期',
  NOT_DUE: '未到期',
};

export const EvidenceKind = {
  QUOTE_SNAPSHOT: 'QUOTE_SNAPSHOT',
  CUSTOMER_ACK: 'CUSTOMER_ACK',
  INTERNAL_ACK: 'INTERNAL_ACK',
  CHANGE_APPROVAL: 'CHANGE_APPROVAL',
  DELAY_CONSENT: 'DELAY_CONSENT',
  PROCUREMENT_PO: 'PROCUREMENT_PO',
  ORIGIN_CERT: 'ORIGIN_CERT',
  EPORT_SYNC: 'EPORT_SYNC',
  SINOSURE_POLICY: 'SINOSURE_POLICY',
  SINOSURE_CONFIRM: 'SINOSURE_CONFIRM',
} as const;

/** 模糊报价用语：命中则禁止推进 */
export const VAGUE_PRICE_RE =
  /价格待定|费用另议|价格另议|费用待定|面议|价格未定|待确认价格|TBD|to\s*be\s*determined|price\s*tbd/i;

/** N3 硬规则：买方/案件未登记中信保投保限额时，不得保存或推进合同 */
export const N3_SINOSURE_UNREGISTERED_REASON = '尚未登记中信保限额，不得签订合同';

/** N5 硬规则：采购合同须关联已签订的销售合同（先销售后采购） */
export const N5_SALES_LINK_REQUIRED_REASON =
  '须关联已签订的销售合同（先销售后采购），否则不得保存或推进采购合同';
export const N5_SALES_NOT_SIGNED_REASON =
  '关联的销售案件尚未完成销售合同签订，须至少到达合同确认（N3）且已签销售合同';

export const HISTORY_DEV_SOFT_PCT = 0.15;
export const HISTORY_DEV_MEDIUM_PCT = 0.3;
