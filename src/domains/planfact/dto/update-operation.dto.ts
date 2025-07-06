import { IsDateString, IsNumber, IsOptional, IsString, IsNotEmpty, IsIn } from 'class-validator';

export class UpdateOperationDto {
  @IsDateString()
  @IsNotEmpty()
  operationDate: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['Перемещение', 'Поступление', 'Выплата', 'Начисление'])
  operationType: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  payPurpose?: string;

  @IsNumber()
  @IsNotEmpty()
  accountAmount: number;

  @IsNumber()
  @IsOptional()
  expenseCategoryId?: number;

  @IsNumber()
  @IsOptional()
  counterPartyId?: number;

  @IsNumber()
  @IsNotEmpty()
  accountId: number;
}