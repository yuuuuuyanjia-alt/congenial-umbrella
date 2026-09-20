import { Controller, Get } from '@nestjs/common';
import { SALES_SHIPMENT_BUCKET_ORDER, SalesShipmentBucketLabel, TRADE_TERM_OPTIONS, TtTimingLabel } from '../cases/sales-contract';
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
  RiskLevelLabel,
  WorkbenchActionLabel,
} from '../common/constants';
import { OccupancyWorkbenchActionLabel } from '../workbench/occupancy-review';

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { ok: true, name: 'export-risk-guard', scope: 'N1-N9' };
  }

  @Get('catalog')
  async catalog() {
    const [hsTemplates, costFloors] = await Promise.all([
      this.prisma.hsTemplate.findMany({ orderBy: { hsCode: 'asc' } }),
      this.prisma.costFloor.findMany(),
    ]);
    return {
      nodes: NODE_CATALOG,
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
      priceBasis: PriceBasisLabel,
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
        n3: '中信保限额未登记，不得签订合同。须先登记投保限额；占用=未履行完毕未回款+已履行完毕未回款+新签合同。超额1–2万中风险软提示，2–5万高风险须工作台领取/放行/驳回，5万以上超高风险硬拦截。CIF/CIP 可登记装运港、装运日期、预计到港与客户是否提货；约定客户付款日期与收汇/未收汇（未收汇=合同总额−收汇金额）',
        n4: '进入变更管理须再次确认或重新上传，并按变更后金额重算买方占用；高风险占用同样走工作台审核',
        formula: '占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额',
        bandsUsd: {
          medium: '[10000, 20000) 中风险，软提示可推进',
          high: '[20000, 50000) 高风险，工作台领取/放行/驳回；放行后可推进，驳回后仍阻断',
          ultraHigh: '[50000, ∞) 超高风险，硬拦截，不进工作台',
          belowMedium: '(0, 10000) 仍显示超额，软提示',
          currency: '演示环境分档以美元计，不自动换算',
        },
      },
      customers: {
        label: '客户管理',
        note: '仅收录已到达销售合同确认（N3）的买方。按规范化名称+国家或税号匹配并合并，避免重复档案。展示中信保限额与占用（未履行完毕未回款、已履行完毕未回款）、剩余额度或超额分档、签过的合同、已收汇/未收汇、约定收款日。到期日优先用合同 paymentDueAt，否则由交货期 + 付款条件账期推算。询盘/报价阶段不录入。',
      },
      suppliers: {
        label: '供应商管理',
        note: '按国内供应商聚合 N5 采购合同/PO。每笔采购展示关联的销售合同（客户、合同号、金额、状态）、是否按期交货、货款一次性付清或分期支付（每期约定付款时间、付款比例、金额、已付未付），以及已付/未付汇总。',
      },
      procurement: {
        label: '采购合同/国内备货',
        n5: '销售合同与采购合同分开签订。公司惯例先销售后采购：保存或推进采购须关联一笔已达 N3 且已签的销售/出口合同。登记国内供应商、采购合同/PO、计划到货与付款方式（一次性付清或分期支付；分期每一期须填约定付款时间、付款比例、金额）；供应商须过制裁/不可靠实体筛查；计划到货不得晚于客户合同交期，否则须结构化延期并保留客户同意证据',
        salesFirst: '先销售后采购：不可在未签销售合同时单独保存采购合同',
      },
      sales: {
        label: '销售合同管理',
        buckets: SalesShipmentBucketLabel,
        bucketOrder: SALES_SHIPMENT_BUCKET_ORDER,
        grouping:
          '列表按未出运 / 已出运 / 已完成分组。已出运：CIF 装运日期已填，或 FOB 国内段到达口岸/港口时间已填，或电汇结算下装运日期已填，或 N6 已通过/已过装运节点，或已有提单号，或 FOB 等无提单路径已登记。已完成：已出运且客户已提货且 N9 已回款（水单/到账且未收汇为 0）。已出运列不含已完成。',
        n3: '运输术语（FOB / CIF 及 CIP 等）与结算方式（前 T/T / 后 T/T）独立，可组合例如 FOB + 前 T/T。CIF/CIP 填写装运港口、装运日期、预计到港；FOB 填写国内段到达口岸/港口时间；电汇填写对应收汇节点。客户是否提货可填；收汇金额以 N9 水单/到账为唯一事实源，本节点只读。T/T 不得写入 incoterms。',
        tradeTerms: TRADE_TERM_OPTIONS,
        ttTiming: TtTimingLabel,
        n6n7:
          '装运/单证规则跟随所选运输术语：FOB/EXW/FAS/FCA 买方安排运输（可无提单）；CIF/CFR 等卖方出单（须正本或电放）。T/T 不是 Incoterm。无有效运输术语时明确回退为 FOB，避免把 T/T 切成 T 后误走卖方提单路径。',
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
  users() {
    return this.prisma.user.findMany();
  }
}
