import { Controller, Get } from '@nestjs/common';
import { SALES_SHIPMENT_BUCKET_ORDER, SalesShipmentBucketLabel, TRADE_TERM_OPTIONS, TtTimingLabel } from '../cases/sales-contract';
import { PROCUREMENT_CURRENCY, SALES_CURRENCY, SALES_CURRENCY_OPTIONS } from '../common/currencies';
import { RemittanceStatusLabel } from '../customers/remittance';
import { PrismaService } from '../prisma/prisma.service';
import {
  BearerLabel,
  BlControlLabel,
  BUYER_ARRANGED_FREIGHT_INCOTERMS,
  CIF_FAMILY_INCOTERMS,
  INCOTERMS_CODES,
  N6_MISSING_TRANSPORT_FALLBACK,
  ChangeFieldLabel,
  ChangeStatusLabel,
  DecisionLabel,
  DelayTriggerLabel,
  EportStatusLabel,
  InstallmentStatusLabel,
  ListCodeLabel,
  NODE_CATALOG,
  OriginEvidenceLabel,
  PartyRoleLabel,
  PaymentModeLabel,
  PriceBasisLabel,
  QuoteIncludedItemLabel,
  QuotePriceUnitLabel,
  RiskLevelLabel,
  UserRole,
  UserRoleLabel,
  WorkbenchActionLabel,
} from '../common/constants';
import { OccupancyWorkbenchActionLabel } from '../workbench/occupancy-review';
import {
  DeliveryMode,
  DeliveryModeLabel,
  TaxFinanceWorkbenchActionLabel,
} from '../tax-finance/tax-finance';
import { normalizeDemoRole, roleLabel } from '../auth/roles';

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { ok: true, name: 'export-risk-guard', scope: 'N2-N9' };
  }

  @Get('catalog')
  async catalog() {
    const [hsTemplates, costFloors] = await Promise.all([
      this.prisma.hsTemplate.findMany({ orderBy: { hsCode: 'asc' } }),
      this.prisma.costFloor.findMany(),
    ]);
    return {
      nodes: NODE_CATALOG,
      userRoles: UserRoleLabel,
      demoRoles: [
        { role: UserRole.SALES, label: UserRoleLabel.SALES, hint: '录入客户/销售/采购并推进 N2–N9；工作台只读' },
        { role: UserRole.RISK, label: UserRoleLabel.RISK, hint: '工作台领取/放行/驳回与筛查处置；可查看合同' },
        { role: UserRole.MANAGER, label: UserRoleLabel.MANAGER, hint: '只读：评估、占用、列表；不可审批或推进' },
      ],
      partyRoles: PartyRoleLabel,
      lists: ListCodeLabel,
      decisions: DecisionLabel,
      risks: RiskLevelLabel,
      blControl: BlControlLabel,
      buyerArrangedFreightIncoterms: BUYER_ARRANGED_FREIGHT_INCOTERMS,
      cifFamilyIncoterms: CIF_FAMILY_INCOTERMS,
      incotermsCodes: INCOTERMS_CODES,
      n6MissingTransportFallback: N6_MISSING_TRANSPORT_FALLBACK,
      workbench: WorkbenchActionLabel,
      occupancyWorkbench: OccupancyWorkbenchActionLabel,
      taxFinanceWorkbench: TaxFinanceWorkbenchActionLabel,
      deliveryMode: DeliveryModeLabel,
      deliveryModes: [DeliveryMode.OWN_WAREHOUSE, DeliveryMode.DIRECT_PORT],
      priceBasis: PriceBasisLabel,
      quoteIncludedItems: QuoteIncludedItemLabel,
      quotePriceUnits: QuotePriceUnitLabel,
      bearers: BearerLabel,
      changeFields: ChangeFieldLabel,
      changeStatus: ChangeStatusLabel,
      delayTriggers: DelayTriggerLabel,
      originEvidence: OriginEvidenceLabel,
      eportStatus: EportStatusLabel,
      remittance: RemittanceStatusLabel,
      paymentMode: PaymentModeLabel,
      installmentStatus: InstallmentStatusLabel,
      sinosure: {
        label: '中信保',
        n3: '中信保限额未登记，不得签订合同。限额币种固定美元。占用不换汇，仅美元销售计入美元占用；人民币合同展示原币并提示暂不计入美元占用。占用=未履行完毕未回款+已履行完毕未回款+新签合同（美元）。超额1–2万中风险软提示，2–5万高风险须工作台领取/放行/驳回，5万以上超高风险硬拦截。',
        n4: '进入变更管理须再次确认或重新上传，并按变更后金额重算买方占用；高风险占用同样走工作台审核。未生效变更禁止推进 N5 采购及 N6+ 装运后续节点',
        formula: '占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额',
        bandsUsd: {
          medium: '[10000, 20000) 中风险，软提示可推进',
          high: '[20000, 50000) 高风险，工作台领取/放行/驳回；放行后可推进，驳回后仍阻断',
          ultraHigh: '[50000, ∞) 超高风险，硬拦截，不进工作台',
          belowMedium: '(0, 10000) 仍显示超额，软提示',
          currency: '占用分档以美元计，不换汇。销售合同可选 CNY / USD；仅 USD 计入占用。中信保限额固定 USD。采购合同/PO 固定 CNY',
        },
      },
      customers: {
        label: '客户管理',
        note: '仅收录已到达销售合同确认（N3）的买方。按规范化名称+国家或税号匹配并合并，避免重复档案。展示中信保限额与占用（未履行完毕未回款、已履行完毕未回款）、剩余额度或超额分档、签过的合同、已收汇/未收汇、约定收款日。到期日优先用合同 paymentDueAt，否则由交货期 + 付款条件账期推算。报价阶段不录入。',
      },
      suppliers: {
        label: '供应商管理',
        note: '按国内供应商聚合 N5 采购合同/PO。每笔采购展示关联的销售合同（客户、合同号、金额、状态）、是否按期交货、货款一次性付清或分期支付（每期约定付款时间、付款比例、金额、已付未付），以及已付/未付汇总。',
      },
      procurement: {
        label: '采购合同/国内备货',
        n5: '销售合同与采购合同分开签订。采购合同/PO 金额固定人民币。公司惯例先销售后采购：保存或推进采购须关联一笔已达 N3 且已签的销售/出口合同。登记国内供应商、采购合同/PO、供应商实际交付日期与实际交付日期、付款方式（一次性付清或分期支付；分期每一期须填约定付款时间、付款比例、金额）；供应商须过制裁/不可靠实体筛查；供应商实际交付日期或实际交付日期任一不得晚于关联销售合同交货期，否则须结构化延期并保留客户同意证据',
        salesFirst: '先销售后采购：不可在未签销售合同时单独保存采购合同',
      },
      sales: {
        label: '销售合同管理',
        buckets: SalesShipmentBucketLabel,
        bucketOrder: SALES_SHIPMENT_BUCKET_ORDER,
        grouping:
          '列表按未出运 / 已出运 / 已完成分组。已出运：CIF 装运日期已填，或 FOB 国内段到达口岸/港口时间已填，或电汇结算下装运日期已填，或 N6 已通过/已过装运节点，或已有提单号，或 FOB 等无提单路径已登记。已完成：已出运且客户已提货且 N9 已回款（水单/到账且未收汇为 0）。已出运列不含已完成。',
        n3: '买方与收货人在本节点填写并筛查，须通过后才能推进。运输术语仅 FOB / CIF，与结算方式（前 T/T / 后 T/T）独立。销售合同金额可选人民币或美元。交货方式为自有仓或港口直出；直出填货物仓储地点、批次号。货物名称与规格默认可从报价带入，与采购合同各自保存。销售合同填写装运港与装运期限（与装运页 CIF 装运港口、装运日期分开）。中信保保单须上传文件并写入证据链。CIF 装运（含货物状态）在装运页办理。前 T/T 登记收汇凭证、收汇金额与比例。',
        tradeTerms: TRADE_TERM_OPTIONS,
        ttTiming: TtTimingLabel,
        currencies: SALES_CURRENCY_OPTIONS,
        defaultCurrency: SALES_CURRENCY,
        procurementCurrency: PROCUREMENT_CURRENCY,
        n6n7:
          'N6 须上传发票与箱单并完成内部审批。装运规则跟随所选运输术语：FOB/EXW/FAS/FCA 买方安排运输（可无提单）；CIF/CFR 等卖方出单（须正本或电放）。不再要求客户书面指示或订舱编号。N7 只要求六份上传：销售合同、商业发票、箱单、采购合同、发票、报关单；商业发票与发票分别必填，缺任一份 409。T/T 不是 Incoterm。无有效运输术语时明确回退为 FOB。存在未生效变更单时 N6/N7/N8/N9 硬拦截，须先生效变更。',
      },
      taxFinance: {
        label: '出口退税与融资性贸易审查',
        note: '公司是出口方不是过桥。不强制自有仓。港口直出须货物流+报关+发票+收汇闭环。红线硬拦截；黄灯（薄利+直出）进工作台第三页领取/通过/驳回。FT4 退税就绪清单在收汇后、申报前勾选。',
        ft1: 'N3/N5 签订前须交货方式；购销货描匹配；薄利+直出黄灯',
        ft2: '选择港口直出须填写货物仓储地点、批次号，否则 409',
        ft3: 'N6–N8 装运/报关与直出单证严重不符红线',
        ft4: 'N9 之后申报退税前：报关放行、N9 收汇、进项发票号、四流勾选',
      },
      hsTemplates: hsTemplates.map((h) => ({
        ...h,
        requiredElements: JSON.parse(h.requiredElementsJson),
      })),
      costFloors,
      note: '筛查接口仅为本地模拟，不含真实制裁 API Key。电子口岸同步为模拟状态。',
    };
  }

  @Get('users')
  async users() {
    const rows = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    const rank: Record<string, number> = { SALES: 0, RISK: 1, MANAGER: 2 };
    return rows
      .map((u) => {
        const role = normalizeDemoRole(u.role) || u.role;
        return { ...u, role, roleLabel: roleLabel(u.role) || u.role };
      })
      .sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9) || a.name.localeCompare(b.name, 'zh'));
  }
}
