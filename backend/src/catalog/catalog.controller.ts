import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BearerLabel,
  BlControlLabel,
  ChangeFieldLabel,
  ChangeStatusLabel,
  DecisionLabel,
  DelayTriggerLabel,
  EportStatusLabel,
  ListCodeLabel,
  NODE_CATALOG,
  OriginEvidenceLabel,
  PartyRoleLabel,
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
      workbench: WorkbenchActionLabel,
      priceBasis: PriceBasisLabel,
      bearers: BearerLabel,
      changeFields: ChangeFieldLabel,
      changeStatus: ChangeStatusLabel,
      delayTriggers: DelayTriggerLabel,
      originEvidence: OriginEvidenceLabel,
      eportStatus: EportStatusLabel,
      sinosure: {
        label: '中信保',
        n3: '合同确认须上传保单并登记投保限额，合同金额不得超过限额',
        n4: '进入变更管理须再次确认或重新上传，并按变更后金额核对限额',
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
