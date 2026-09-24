import { IsOptional, IsString } from 'class-validator';

export class RiskActionDto {
  @IsString()
  conclusion!: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  dueAt?: string;
}
