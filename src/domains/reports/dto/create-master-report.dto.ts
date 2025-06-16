import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const types = [
  'Стандартная',
  'Уличная',
  'РГБ',
  'Смарт',
  'Контражур',
  'ВБ',
  'ОЗОН',
  'Подарок',
];

export class CreateRopReportDto {
  @IsString({ message: 'saleDate должно быть строкой (дата продажи).' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"s
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'saleDate должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  @IsString({ message: 'Название или ссылка должно быть строкой.' })
  @IsNotEmpty()
  name: string;

  @IsIn(types, { message: 'Не верный тип макета' })
  type: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  els: number;

  @IsInt()
  @Min(0.1)
  @IsNotEmpty()
  metrs: number;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  cost: number;
}
