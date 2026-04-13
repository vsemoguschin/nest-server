import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpdateVariantBudgetDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  budgetLimitDay: number;
}
