import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CasesService } from '../cases/cases.service';
import { WorkbenchDto } from '../cases/dto';
import { Disposition, WorkbenchActionLabel } from '../common/constants';

@Controller('workbench')
export class WorkbenchController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
  ) {}

  @Get()
  meta() {
    return {
      title: '案例工作台',
      actions: WorkbenchActionLabel,
      queues: ['OPEN', 'SUPPLEMENTED', 'MONITORING'],
    };
  }

  @Get('queue')
  async queue() {
    const hits = await this.prisma.screeningHit.findMany({
      where: {
        disposition: { in: [Disposition.OPEN, Disposition.SUPPLEMENTED, Disposition.MONITORING] },
      },
      include: { case: true, party: true },
      orderBy: { createdAt: 'desc' },
    });
    return hits;
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
