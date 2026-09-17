import { Module } from '@nestjs/common';
import { GateService } from './gate.service';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [CustomersModule],
  providers: [GateService],
  exports: [GateService],
})
export class GateModule {}
