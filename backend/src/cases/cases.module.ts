import { Module } from '@nestjs/common';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { AuditModule } from '../audit/audit.module';
import { ScreeningModule } from '../screening/screening.module';
import { GateModule } from '../gates/gate.module';
import { CustomersModule } from '../customers/customers.module';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [AuditModule, ScreeningModule, GateModule, CustomersModule, SuppliersModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
