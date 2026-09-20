import { Controller, Get } from '@nestjs/common';
import { RemittanceStatusLabel } from '../customers/remittance';
import { PrismaService } from '../prisma/prisma.service';
import {
  BearerLabel,
  BlControlLabel,
  BUYER_ARRANGED_FREIGHT_INCOTERMS,
  CIF_FAMILY_INCOTERMS,
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
      workbench: WorkbenchActionLabel,
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
        n3: '中信保限额未登记，不得签订合同。须先登记投保限额；占用=未履行完毕未回款+已履行完毕未回款+新签合同。超额1–2万中风险软提示，2–5万高风险审核，5万以上超高风险硬拦截。CIF/CIP 可登记装运港、装运日期、预计到港与客户是否提货；约定客户付款日期与收汇/未收汇（未收汇=合同总额−收汇金额）',
        n4: '进入变更管理须再次确认或重新上传，并按变更后金额重算买方占用',
        formula: '占用 = 未履行完毕合同未回款 + 已履行完毕合同未回款 + 新签订合同金额',
        bandsUsd: {
          medium: '[10000, 20000) 中风险，软提示可推进',
          high: '[20000, 50000) 高风险，审核队列',
          ultraHigh: '[50000, ∞) 超高风险，硬拦截',
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
        n3: '打开即填写销售合同。CIF/CIP 显示装运港口、装运日期、预计到达日期与到达港口、客户是否提货；FOB 等不显示该区块（N6 无提单路径不变）。任意术语均可登记约定客户付款日期、是否收汇、收汇金额；未收汇金额按合同总额−收汇金额自动计算。',
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
