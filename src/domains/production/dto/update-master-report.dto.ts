import {
  IsDateString,
  IsString,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
} from 'class-validator';

export class UpdateMasterReportDto {
  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber({}, { message: 'Метры должны быть числом' })
  @Min(0, { message: 'Метры должны быть больше или равны нулю' })
  @IsOptional()
  metrs?: number;

  @IsNumber({}, { message: 'Элементы должны быть числом' })
  @Min(0, { message: 'Элементы должны быть больше или равны нулю' })
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

  @IsNumber({}, { message: 'Стоимость должна быть числом' })
  @Min(0, { message: 'Стоимость должна быть больше или равна нулю' })
  @IsOptional()
  cost?: number;

  @IsNumber({}, { message: 'Штраф должен быть числом' })
  @Min(0, { message: 'Штраф должен быть больше или равны нулю' })
  @IsOptional()
  penaltyCost?: number;

  @IsString()
  @IsOptional()
  comment?: string;
}
