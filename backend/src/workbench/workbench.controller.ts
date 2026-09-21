import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CasesService } from '../cases/cases.service';
import { WorkbenchDto } from '../cases/dto';
import { WorkbenchActionLabel } from '../common/constants';
import { OccupancyWorkbenchActionLabel } from './occupancy-review';
import { TaxFinanceWorkbenchActionLabel } from '../tax-finance/tax-finance';
import { WorkbenchService } from './workbench.service';

@Controller('workbench')
export class WorkbenchController {
  constructor(
    private readonly workbench: WorkbenchService,
    private readonly cases: CasesService,
  ) {}

  @Get()
  meta() {
    return {
      title: '审核工作台',
      actions: WorkbenchActionLabel,
      occupancyActions: OccupancyWorkbenchActionLabel,
      taxFinanceActions: TaxFinanceWorkbenchActionLabel,
      queues: ['OPEN', 'CLAIMED', 'REJECTED', 'HARD_BLOCKED', 'SUPPLEMENTED', 'MONITORING'],
    };
  }

  @Get('queue')
  queue() {
    return this.workbench.queue();
  }

  @Post(':caseId/action')
  act(
    @Param('caseId') caseId: string,
    @Body() dto: WorkbenchDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.cases.applyWorkbench(caseId, dto, actorId);
  }
}
