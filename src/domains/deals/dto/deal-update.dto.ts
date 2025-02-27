import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Matches,
  IsDateString,
  IsIn,
  ValidateIf,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

const statuses = [
  'Создана',
  'Изготовление',
  'Готов',
  'Готов к отправке',
  'Отправлен',
  'Доставлен',
];
const disconts = ['Без скидки', 'Желтая', 'ОПТ', 'Рассылка', 'Красная'];
const maketTypes = [
  'Дизайнерский',
  'Заготовка из базы',
  'Рекламный',
  'Визуализатор',
  'Из рассылки',
];

const categories = ['Услуги', 'Товары для бизнеса', 'Мебель', 'Интерьер', ''];

export class UpdateDealDto {
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
  saleDate: string;

  @IsString({ message: 'card_id должен быть строкой.' })
  @IsNotEmpty({ message: 'card_id обязателен.' })
  @Matches(/^\d+$/, { message: 'card_id должен состоять только из цифр.' })
  card_id: string;

  @IsString({ message: 'Название сделки должно быть строкой.' })
  @IsNotEmpty()
  title: string;

  @IsInt({ message: 'price должен быть целым числом (стоимость без допов).' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsIn(statuses, { message: 'Неверный статус' })
  status: string = statuses[0]; // Значение по умолчанию

  @IsString({ message: 'clothingMethod должно быть строкой (метод закрытия).' })
  @IsNotEmpty({ message: 'Метод закрытия обязательное поле' })
  clothingMethod: string;

  @IsString({ message: 'description должно быть строкой (description).' })
  @IsOptional() // Разрешает undefined
  @ValidateIf((obj) => obj.description !== undefined && obj.description !== null) // Проверяем только если явно указано
  
  description?: string;

  @IsString({ message: 'source должно быть строкой (источник сделки).' })
  @IsNotEmpty({ message: 'Источник сделки обязательное поле' })
  source: string;

  @IsString({ message: 'adTag должно быть строкой (ТЕГ сделки).' })
  @IsNotEmpty({ message: 'ТЕГ обязательное поле' })
  adTag: string;

  @IsIn(disconts, { message: 'Не верная скидка' })
  discont: string;

  @IsString({ message: 'sphere должно быть строкой (сфера деятельности).' })
  @IsOptional() // Разрешает undefined
  @ValidateIf((obj) => obj.sphere !== undefined && obj.sphere !== null) // Проверяем только если явно указано
  sphere?: string;

  @IsString({ message: 'city должно быть строкой (город).' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsNotEmpty()
  @IsOptional()
  city?: string;

  @IsOptional()
  @IsString({ message: 'region должно быть строкой (регион).' })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsNotEmpty()
  region?: string;

  @IsBoolean({ message: 'paid должно быть true или false (оплачена?).' })
  @IsOptional()
  paid?: boolean = false;

  @IsIn(maketTypes, { message: 'Не верный тип макета' })
  maketType: string;

  @IsString({ message: 'дата презентации макета должно быть строкой.' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    {
      message:
        'дата презентации макета должна быть валидной датой в формате YYYY-MM-DD',
    },
  )
  maketPresentation: string;

  @IsString({ message: 'period должно быть строкой (период).' })
  @IsOptional()
  @IsNotEmpty()
  period?: string;

  @IsOptional() // Поле необязательное
  @IsIn(categories, { message: "Не верная категория" })
  category?: string | '';

}
