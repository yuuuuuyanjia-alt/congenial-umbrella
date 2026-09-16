import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BlControlLabel,
  DecisionLabel,
  ListCodeLabel,
  NODE_CATALOG,
  PartyRoleLabel,
  RiskLevelLabel,
  WorkbenchActionLabel,
} from '../common/constants';

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { ok: true, name: 'export-risk-guard', scope: 'MVP-1-3-6-7-9' };
  }

  @Get('catalog')
  catalog() {
    return {
      nodes: NODE_CATALOG,
      partyRoles: PartyRoleLabel,
      lists: ListCodeLabel,
      decisions: DecisionLabel,
      risks: RiskLevelLabel,
      blControl: BlControlLabel,
      workbench: WorkbenchActionLabel,
      note: '筛查接口仅为本地模拟，不含真实制裁 API Key。',
    };
  }

  @Get('users')
  users() {
    return this.prisma.user.findMany();
  }
}
