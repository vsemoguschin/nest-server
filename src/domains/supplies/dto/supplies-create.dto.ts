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
} from 'class-validator';

const paymentMethods = ['Счет', 'Перевод', 'Наличка'];
const orderStatuses = ['Оформлен заказ', 'В пути', 'Отгружен нам'];
const paymentStatuses = ['Оплачен', 'Не оплачен'];
const deliveryMethods = [
  'Сдек',
  'Самовывоз',
  'Доставка от поставщика',
  'Курьерская доставка',
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

export class SuppliesCreateDto {
  @IsString({ message: 'Дата должно быть строкой.' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'Дата должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  @IsOptional() // Поле может быть undefined или пустой строкой
  @ValidateIf((o) => o.shipmentDate !== '') // Применять валидацию, только если строка не пустая
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
  shipmentDate?: string = '';

  @IsIn(categories, { message: 'Не верная категория' })
  category: string;

  @IsString({ message: 'Описание должно быть строкой.' })
  @IsNotEmpty()
  description: string;

  @IsInt({ message: 'Колличество должен быть целым числом' })
  @Min(1, { message: 'Колличество должна быть больше нуля.' })
  quantity: number;

  @IsInt({ message: 'price должен быть целым числом (стоимость без допов).' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsString({ message: 'supplier должно быть строкой (Поставщик).' })
  @IsNotEmpty({ message: 'Метод закрытия обязательное поле' })
  supplier: string;

  @IsIn(paymentMethods, { message: 'Не верны способ оплаты' })
  paymentMethod: string;

  @IsIn(orderStatuses, { message: 'Не верный статус' })
  orderStatus: string;

  @IsIn(paymentStatuses, { message: 'Не верный статус' })
  paymentStatus: string;

  @IsIn(deliveryMethods, { message: 'Не верный статус' })
  deliveryMethod: string;

  @IsString({ message: 'track должно быть строкой.' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsNotEmpty()
  @IsOptional()
  track?: string | null = '';

  @IsString({ message: 'invoice должно быть строкой.' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsNotEmpty()
  @IsOptional()
  invoice?: string | null = '';
}
