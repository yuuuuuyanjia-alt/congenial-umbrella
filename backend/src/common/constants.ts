/** 节点目录：MVP 仅实现 1/3/6/7/9，其余为后续 TODO 占位 */
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
    name: '信用证/信用险',
    mvp: false,
    isHardGate: false,
    isStub: true,
    summary: 'TODO：开证行/保兑行筛查、软条款与信用险承保范围（后续版本）。',
  },
  {
    code: 'N3',
    name: '合同/订单确认',
    mvp: true,
    isHardGate: false,
    isStub: false,
    summary: '所有权保留与争议解决条款必填；校验国际贸易术语与付款条件。',
  },
  {
    code: 'N4',
    name: '生产备货/质检',
    mvp: false,
    isHardGate: false,
    isStub: true,
    summary: 'TODO：货物与合同一致性、出口管制物项核对（后续版本）。',
  },
  {
    code: 'N5',
    name: '报关出口',
    mvp: false,
    isHardGate: false,
    isStub: true,
    summary: 'TODO：报关单与合同/发票核对、口岸与目的国合规（后续版本）。',
  },
  {
    code: 'N6',
    name: '装运/提单指示',
    mvp: true,
    isHardGate: true,
    isStub: false,
    summary: '硬闸门：客户书面指示 + 内部审批 + 提单控制（正本/电放）。',
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
    name: '交单/议付',
    mvp: false,
    isHardGate: false,
    isStub: true,
    summary: 'TODO：交单路径、不符点与银行筛查（后续版本）。',
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
} as const;

export const PartyRoleLabel: Record<string, string> = {
  BUYER: '买方',
  PAYER: '付款人',
  CONSIGNEE: '收货人',
};

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
} as const;

export const BlControlLabel: Record<string, string> = {
  ORIGINAL: '正本提单',
  TELEX_RELEASE: '电放提单',
};

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
