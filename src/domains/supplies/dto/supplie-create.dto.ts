import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsDateString,
  IsIn,
  Min,
  ValidateIf,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

const paymentMethods = ['Счет', 'Перевод', 'Наличка'];
const orderStatuses = ['Оформлен заказ', 'В пути', 'Отгружен нам'];
const paymentStatuses = ['Оплачен', 'Не оплачен'];
const deliveryMethods = [
  'Сдек',
  'Самовывоз',
  'Доставка от поставщика',
  'Курьерская доставка',
  'ПЭК',
  'Деловые Линии'
];
const categories = [
  'Поликарбонат',
  'Неон',
  'Блоки питания',
  'Пленки',
  'Акрил',
  'Упаковка',
  'Комплектующие для станков',
  'Комплектующие для мастеров',
  'Комплектующие для упаковки',
  'Другое',
];

// DTO для позиции поставки
export class SuppliePositionCreateDto {
  @IsString({ message: 'Название позиции должно быть строкой.' })
  @IsNotEmpty({ message: 'Название позиции обязательно.' })
  name: string;

  @IsInt({ message: 'Количество должно быть целым числом.' })
  @Min(1, { message: 'Количество должно быть больше 0.' })
  quantity: number;

  @Min(1, { message: 'Цена за единицу должна быть больше или равна 1.' })
  priceForItem: number;

  @IsIn(categories, { message: 'Неверная категория.' })
  @IsNotEmpty({ message: 'Категория обязательна.' })
  category: string;
}

// DTO для создания поставки
export class SupplieCreateDto {
  @IsString({ message: 'Дата должна быть строкой.' })
  @IsNotEmpty({ message: 'Дата обязательна.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата должна быть в формате YYYY-MM-DD',
  })
  @IsDateString(
    {},
    { message: 'Дата должна быть валидной в формате YYYY-MM-DD' },
  )
  date: string;

  @IsOptional()
  @ValidateIf((o) => o.shipmentDate !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата отгрузки должна быть в формате YYYY-MM-DD',
  })
  @IsDateString(
    { strict: true },
    { message: 'Дата отгрузки должна быть валидной в формате YYYY-MM-DD' },
  )
  shipmentDate?: string = '';

  @IsString({ message: 'Поставщик должен быть строкой.' })
  @IsNotEmpty({ message: 'Поставщик обязателен.' })
  supplier: string;

  @IsIn(paymentMethods, { message: 'Неверный способ оплаты.' })
  @IsNotEmpty({ message: 'Способ оплаты обязателен.' })
  paymentMethod: string;

  @IsIn(orderStatuses, { message: 'Неверный статус заказа.' })
  @IsNotEmpty({ message: 'Статус заказа обязателен.' })
  orderStatus: string;

  @IsIn(paymentStatuses, { message: 'Неверный статус оплаты.' })
  @IsNotEmpty({ message: 'Статус оплаты обязателен.' })
  paymentStatus: string;

  @IsIn(deliveryMethods, { message: 'Неверный способ доставки.' })
  @IsNotEmpty({ message: 'Способ доставки обязателен.' })
  deliveryMethod: string;

  @IsString({ message: 'Трек должен быть строкой.' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  track?: string | null = '';

  @IsString({ message: 'Номер счета должен быть строкой.' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  invoice?: string | null = '';

  @IsArray({ message: 'Позиции должны быть массивом.' })
  @ValidateNested({ each: true })
  @Type(() => SuppliePositionCreateDto)
  @IsNotEmpty({ message: 'Массив позиций не может быть пустым.' })
  positions: SuppliePositionCreateDto[];
} 
