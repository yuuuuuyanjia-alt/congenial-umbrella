import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '../prisma/prisma.module';
import { DemoAuthGuard } from './demo-auth.guard';

@Module({
  imports: [PrismaModule],
  providers: [{ provide: APP_GUARD, useClass: DemoAuthGuard }],
})
export class AuthModule {}
