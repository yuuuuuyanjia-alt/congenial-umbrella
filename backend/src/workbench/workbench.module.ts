import { Module } from '@nestjs/common';
import { WorkbenchController } from './workbench.controller';
import { CasesModule } from '../cases/cases.module';

@Module({
  imports: [CasesModule],
  controllers: [WorkbenchController],
})
export class WorkbenchModule {}
