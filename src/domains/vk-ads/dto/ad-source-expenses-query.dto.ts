import { IsOptional, IsString } from 'class-validator';

export class AdSourceExpensesQueryDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
