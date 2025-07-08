import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt } from 'class-validator';

export class CreateCounterPartyDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  inn?: string;

  @IsString()
  @IsOptional()
  kpp?: string;

  @IsString()
  @IsOptional()
  account?: string;

  @IsString()
  @IsOptional()
  bankBic?: string;

  @IsString()
  @IsOptional()
  bankName?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Банки', 'Гос. органы', 'Клиенты', 'Поставщики', 'Сотрудники', ''], {
    message:
      'contrAgentGroup должен быть одним из: Банки, Гос. органы, Клиенты, Поставщики, Сотрудники или пустым',
  })
  contrAgentGroup?: string;

  @IsInt()
  @IsOptional()
  incomeExpenseCategoryId?: number | null;

  @IsInt()
  @IsOptional()
  outcomeExpenseCategoryId?: number | null;
}
