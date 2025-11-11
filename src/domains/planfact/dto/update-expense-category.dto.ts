import { IsString, IsOptional, IsIn, IsInt } from 'class-validator';

export class UpdateExpenseCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Доходы', 'Расходы', 'Активы', 'Обязательства', 'Капитал'])
  type?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  parentId?: number | null;
}
