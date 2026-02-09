import {
  IsString,
  IsNumber,
  IsDateString,
  IsIn,
  Min,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class CreateMasterReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @IsString({ message: 'Название должно быть строкой' })
  name: string;

  @IsNumber({}, { message: 'Метры должны быть числом' })
  @Min(0, { message: 'Метры должны быть больше или равны нулю' })
  metrs: number;

  @IsNumber({}, { message: 'Элементы должны быть числом' })
  @Min(0, { message: 'Элементы должны быть больше или равны нулю' })
  els: number;

  @IsString({ message: 'Тип должен быть строкой' })
  @IsIn(
    [
      'Стандартная',
      'Уличная',
      'РГБ',
      'Смарт',
      'Контражур',
      'ВБ',
      'ОЗОН',
      'Подарок',
      'Ремонт',
      'Уличная подсветка',
      'РГБ Контражур',
      'ПВХ',
    ],
    { message: 'Недопустимый тип' },
  )
  type: string;

  @IsNumber({}, { message: 'Стоимость должна быть числом' })
  @Min(0, { message: 'Стоимость должна быть больше или равна нулю' })
  cost: number;

  @IsNumber({}, { message: 'ID пользователя должен быть числом' })
  @Min(0, { message: 'ID пользователя должен быть больше или равен нулю' })
  userId: number;

  @IsNumber({}, { message: 'Штраф должен быть числом' })
  @Min(0, { message: 'Штраф должен быть больше или равны нулю' })
  @IsOptional()
  penaltyCost?: number;

  @IsString()
  @IsOptional()
  comment?: string;

  @IsBoolean({ message: 'isPenalty должен быть булевым значением' })
  @IsOptional()
  isPenalty?: boolean;

  @IsString({ message: 'Тип освещения должен быть строкой' })
  @IsOptional()
  lightingType?: string;

  @IsNumber({}, { message: 'Длина освещения должна быть числом' })
  @Min(0, { message: 'Длина освещения должна быть больше или равна нулю' })
  @IsOptional()
  lightingLength?: number;

  @IsNumber({}, { message: 'Элементы освещения должны быть числом' })
  @Min(0, { message: 'Элементы освещения должны быть больше или равны нулю' })
  @IsOptional()
  lightingElements?: number;

  @IsNumber({}, { message: 'Стоимость освещения должна быть числом' })
  @Min(0, { message: 'Стоимость освещения должна быть больше или равна нулю' })
  @IsOptional()
  lightingCost?: number;

  @IsNumber({}, { message: 'ID сделки должен быть числом' })
  @Min(0, { message: 'ID сделки должен быть больше или равен нулю' })
  @IsOptional()
  dealId?: number;

  @IsNumber({}, { message: 'ID заказа должен быть числом' })
  @Min(0, { message: 'ID заказа должен быть больше или равен нулю' })
  @IsOptional()
  orderId?: number;
}
