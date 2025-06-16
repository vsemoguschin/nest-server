import {
  IsString,
  IsNumber,
  IsDateString,
  IsIn,
  IsOptional,
} from 'class-validator';

export class UpdateMasterReportDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  metrs?: number;

  @IsNumber()
  @IsOptional()
  els?: number;

  @IsString()
  @IsIn([
    'Стандартная',
    'Уличная',
    'РГБ',
    'Смарт',
    'Контражур',
    'ВБ',
    'ОЗОН',
    'Подарок',
  ])
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsOptional()
  cost?: number;
}
