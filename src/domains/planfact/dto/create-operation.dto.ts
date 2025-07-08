import { IsString, IsDateString, IsInt, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

class OperationPositionDto {
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsInt()
  counterPartyId?: number | null;

  @IsOptional()
  @IsInt()
  expenseCategoryId?: number | null;
}

export class CreateOperationDto {
  @IsDateString()
  operationDate: string;

  @IsString()
  operationType: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  payPurpose?: string;

  @IsInt()
  accountId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationPositionDto)
  operationPositions: OperationPositionDto[];
}