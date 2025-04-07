import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  Matches,
  IsDateString,
  IsIn,
  Min,
} from 'class-validator';

// import { UserDto } from 'src/domains/users/dto/user.dto';
import { CreateClientDto } from 'src/domains/clients/dto/client-create.dto';
import { WorkSpaceDto } from 'src/domains/workspaces/dto/workspace.dto';

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

const categories = ['Услуги', 'Товары для бизнеса', 'Мебель', 'Интерьер'];

export class DealDto {
  @IsString({ message: 'saleDate должно быть строкой (дата продажи).' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'saleDate должна быть валидной датой в формате YYYY-MM-DD' },
  )
  saleDate: string;

  @IsString({ message: 'card_id должен быть строкой.' })
  @IsNotEmpty({ message: 'card_id обязателен.' })
  @Matches(/^\d+$/, { message: 'card_id должен состоять только из цифр.' })
  card_id: string;

  @IsString({ message: 'title должно быть строкой (название сделки).' })
  @IsNotEmpty()
  title: string;

  @IsInt({ message: 'price должен быть целым числом (стоимость без допов).' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsIn(statuses, { message: 'Неверный статус' })
  status: string = statuses[0]; // Значение по умолчанию

  @IsString({ message: 'deadline должно быть строкой (дедлайн).' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsString({ message: 'clothingMethod должно быть строкой (метод закрытия).' })
  @IsNotEmpty()
  clothingMethod: string;

  @IsString({ message: 'description должно быть строкой (описание).' })
  @IsOptional()
  @IsNotEmpty()
  description?: string;

  @IsString({ message: 'source должно быть строкой (источник сделки).' })
  @IsNotEmpty()
  source: string;

  @IsString({ message: 'adTag должно быть строкой (ТЕГ сделки).' })
  @IsNotEmpty()
  adTag: string;

  @IsIn(disconts, { message: 'Не верная скидка' })
  discont: string;

  @IsString({ message: 'sphere должно быть строкой (сфера деятельности).' })
  @IsOptional()
  @IsNotEmpty()
  sphere?: string;

  @IsString({ message: 'city должно быть строкой (город).' })
  @IsNotEmpty()
  @IsOptional()
  city?: string;

  @IsString({ message: 'region должно быть строкой (регион).' })
  @IsOptional()
  @IsNotEmpty()
  region?: string;

  @IsBoolean({ message: 'paid должно быть true или false (оплачена?).' })
  @IsOptional()
  paid?: boolean = false;

  @IsIn(maketTypes, { message: 'Не верный тип макета' })
  maketType: string;

  @IsString({
    message: 'maketPresentation должно быть строкой (дата презентации макета).',
  })
  @IsNotEmpty()
  maketPresentation: string;

  @IsString({ message: 'period должно быть строкой (период).' })
  @IsOptional()
  @IsNotEmpty()
  period?: string;

  @IsOptional() // Поле необязательное
  @IsIn(categories, { message: 'Не верная категория' })
  category?: string;

  @IsInt({ message: 'userId должен быть целым числом (ID пользователя).' })
  userId: number;

  dops?: {
    saleDate: string;
    price: number;
    description: string;
    period: string;
    userId: number;
    id: number;
    dealId: number;
    type: string;
  }[];

  payments?: {
    title: string;
    price: number;
    description: string;
    period: string;
    userId: number;
    id: number;
    dealId: number;
    date: string;
    method: string;
    reservation: boolean;
  }[];

  client?: CreateClientDto;
  deliveries?: {
    price: number;
    status: string;
    description: string;
    id: number;
    dealId: number;
    type: string;
    date: string;
    method: string;
    track: string;
  }[];
  workSpace?: WorkSpaceDto;

  @IsInt({ message: 'workSpaceId должен быть целым числом (ID пространства).' })
  workSpaceId: number;

  @IsInt({ message: 'groupId должен быть целым числом (ID группы).' })
  groupId: number;

  @IsInt({ message: 'clientId должен быть целым числом (ID клиента).' })
  clientId: number;
}
