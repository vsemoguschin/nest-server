import { IsNumber, IsDateString, Min, IsString, IsOptional } from 'class-validator';

export class UpdateFrezerReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date?: string;

  @IsNumber({}, { message: 'Вывески должны быть числом' })
  @Min(0, { message: 'Вывески должны быть больше или равны нулю' })
  items?: number;

  @IsNumber({}, { message: 'Целые листы должны быть числом' })
  @Min(0, { message: 'Целые листы должны быть больше или равны нулю' })
  sheets?: number;

  @IsNumber({}, { message: 'Переделки должны быть числом' })
  @Min(0, { message: 'Переделки должны быть больше или равны нулю' })
  remake?: number;

  @IsNumber({}, { message: 'Часы работы должны быть числом' })
  @Min(0, { message: 'Часы работы должны быть больше или равны нулю' })
  hours?: number;

  @IsNumber({}, { message: 'Стоимость должна быть числом' })
  @Min(0, { message: 'Стоимость должна быть больше или равна нулю' })
  cost?: number;

  @IsNumber({}, { message: 'Площадь должна быть числом' })
  @Min(0, { message: 'Площадь должна быть больше или равна нулю' })
  square?: number;

  @IsNumber({}, { message: 'Штраф должен быть числом' })
  @Min(0, { message: 'Штраф должен быть больше или равны нулю' })
  @IsOptional()
  penaltyCost?: number;

  @IsString()
  @IsOptional()
  comment?: string;
}
