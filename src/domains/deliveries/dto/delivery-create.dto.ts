import {
  IsString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  Matches,
  IsIn,
  ValidateIf,
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
const types = ['Платно', 'Бесплатно'];
const purposes = ['Заказ', 'Досыл', 'Ремонт', 'Возврат'];

// Статусы доставки
const statuses = ['Создана', 'Доступна', 'Отправлена', 'Вручена', 'Возврат'];

export class DeliveryCreateDto {
  @IsOptional() // Поле может быть undefined или пустой строкой
  @ValidateIf((o) => o.date !== '') // Применять валидацию, только если строка не пустая
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Формат YYYY-MM-DD (пустая строка уже исключена через ValidateIf)
    {
      message: 'Дата должна быть в формате YYYY-MM-DD',
    },
  )
  @IsDateString(
    { strict: true }, // Проверяет валидность даты в формате YYYY-MM-DD
    {
      message: 'Дата должна быть валидной в формате YYYY-MM-DD',
    },
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
    description: 'Тип отправки',
    example: 'Заказ',
    default: 'Заказ',
  })
  @IsString()
  @IsOptional()
  @IsIn(purposes, { message: 'Неверный тип отправки' })
  purpose?: string = purposes[0]; // Значение по умолчанию

  @ApiProperty({
    description: 'Стоимость доставки',
    example: 1500.5,
    default: 0,
  })
  @IsOptional()
  price?: number;

  @ApiProperty({
    description: 'ID сделки',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  dealId: number;

  @IsOptional() // Поле может быть undefined или пустой строкой
  @ValidateIf((o) => o.deliveredDate !== '') // Применять валидацию, только если строка не пустая
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Формат YYYY-MM-DD (пустая строка уже исключена через ValidateIf)
    {
      message: 'Дата должна быть в формате YYYY-MM-DD',
    },
  )
  @IsDateString(
    { strict: true }, // Проверяет валидность даты в формате YYYY-MM-DD
    {
      message: 'Дата должна быть валидной в формате YYYY-MM-DD',
    },
  )
  deliveredDate?: string; // Поле опционально
}
