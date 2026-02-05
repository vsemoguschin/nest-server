import {
  IsString,
  IsDateString,
  IsInt,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

class OperationPositionDto {
  @IsOptional()
  @IsInt()
  id?: number;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsInt()
  counterPartyId?: number | null;

  @IsOptional()
  @IsInt()
  expenseCategoryId?: number | null;
}

export class UpdateOperationDto {
  @IsOptional()
  @IsDateString()
  operationDate?: string;

  @IsOptional()
  @IsString()
  operationType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  payPurpose?: string;

  @IsInt()
  accountId: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OperationPositionDto)
  operationPositions?: OperationPositionDto[];
}
