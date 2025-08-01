import {
  IsString,
  IsNumber,
  IsDateString,
  IsIn,
  Min,
  IsOptional,
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
      'Уличный контражур'
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
}
