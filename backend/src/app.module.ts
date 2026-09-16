import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { ScreeningModule } from './screening/screening.module';
import { GateModule } from './gates/gate.module';
import { CasesModule } from './cases/cases.module';
import { WorkbenchModule } from './workbench/workbench.module';
import { CatalogModule } from './catalog/catalog.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ScreeningModule,
    GateModule,
    CasesModule,
    WorkbenchModule,
    CatalogModule,
  ],
})
export class AppModule {}
