import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Доходы', 'Расходы', 'Активы', 'Обязательства', 'Капитал'])
  type: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @IsOptional()
  parentId?: number | null;
}