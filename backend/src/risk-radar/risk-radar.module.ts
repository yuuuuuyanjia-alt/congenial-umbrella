import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ScreeningModule } from '../screening/screening.module';
import { RiskRadarController } from './risk-radar.controller';
import { RiskRadarService } from './risk-radar.service';

@Module({
  imports: [ScreeningModule, AuditModule],
  controllers: [RiskRadarController],
  providers: [RiskRadarService],
})
export class RiskRadarModule {}
