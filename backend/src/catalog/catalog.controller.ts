import { Controller, Get } from '@nestjs/common';
import { RemittanceStatusLabel } from '../customers/remittance';
import { PrismaService } from '../prisma/prisma.service';
import {
  BearerLabel,
  BlControlLabel,
  BUYER_ARRANGED_FREIGHT_INCOTERMS,
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
        n3: '合同确认须上传保单并登记投保限额，合同金额不得超过限额',
        n4: '进入变更管理须再次确认或重新上传，并按变更后金额核对限额',
      },
      customers: {
        label: '客户管理',
        note: '仅收录已到达合同确认（N3）的买方。按规范化名称+国家或税号匹配并合并，避免重复档案。展示中信保限额、签过的合同、已收汇/未收汇、约定收款日（按期/逾期/未到期）。到期日优先用合同 paymentDueAt，否则由交货期 + 付款条件账期推算。询盘/报价阶段不录入。',
      },
      suppliers: {
        label: '供应商管理',
        note: '按国内供应商聚合 N5 采购合同/PO。展示是否按期交货、货款分期（比例/金额、付款条件、已付未付、是否过约定付款日），以及已付/未付汇总。',
      },
      procurement: {
        label: '国内采购/备货',
        n5: '登记国内供应商、采购合同/PO、计划到货与货款支付计划（一次性付清或分期，如到货 90% + 尾款 10%）；供应商须过制裁/不可靠实体筛查；计划到货不得晚于客户合同交期，否则须结构化延期并保留客户同意证据',
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
