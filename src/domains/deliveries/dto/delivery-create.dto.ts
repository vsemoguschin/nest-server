import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  Matches,
  IsIn,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Методы доставки
const methods = [
  'СДЕК',
  'ПОЧТА РОССИИ',
  'Яндекс',
  'Балтийский курьер',
  'Самовывоз',
  'ТК КИТ',
  'ПЭТ',
  'Боксбери',
  'Деловые линии',
];
// Типы доставки
const types = ['Нет', 'Платно', 'Бесплатно', 'Досыл'];

// Статусы доставки
const statuses = ['Создана', 'Доступна', 'Отправлена', 'Вручена', 'Возврат'];

export class DeliveryCreateDto {
  @IsString({ message: 'Дата продажи должно быть строкой.' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'Дата продажи должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  @ApiProperty({
    description: 'Описание доставки',
    example: 'Доставка в центр города',
    default: '',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Трек-номер',
    example: 'ABC123456789',
    default: '',
  })
  @IsString()
  @IsOptional()
  track?: string;

  @ApiProperty({
    description: 'Статус доставки',
    example: 'Создана',
    default: 'Создана',
  })
  @IsString()
  @IsOptional()
  @IsIn(statuses, { message: 'Неверный статус' })
  status?: string = statuses[0]; // Значение по умолчанию

  @ApiProperty({
    description: 'Метод доставки',
    example: 'СДЕК',
    default: 'СДЕК',
  })
  @IsString()
  @IsOptional()
  @IsIn(methods, { message: 'Неверный метод доставки' })
  method?: string = methods[0]; // Значение по умолчанию

  @ApiProperty({
    description: 'Тип доставки',
    example: 'Платно',
    default: 'Нет',
  })
  @IsString()
  @IsOptional()
  @IsIn(types, { message: 'Неверный тип доставки' })
  type?: string = types[0]; // Значение по умолчанию

  @ApiProperty({
    description: 'Стоимость доставки',
    example: 1500,
    default: 0,
  })
  @IsInt()
  @IsOptional()
  price?: number;

  @ApiProperty({
    description: 'ID сделки',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  dealId: number;
}
