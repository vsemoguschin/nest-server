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
const paymentMethods = [
  'Наличные',
  'Перевод',
  'Договор',
  'Наложка',
  'Ссылка',
  'Долями',
  'Рассрочка',
  'Счет',
  'Возврат',
];

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'Назначение платежа не может быть пустым' })
  title: string;

  @IsInt({ message: 'price должен быть целым числом (стоимость без допов).' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsString({ message: 'Дата оплаты должно быть строкой.' })
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'Дата оплаты должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  // @IsString({ message: 'Метод должно быть строкой.' })
  // @IsNotEmpty()
  @IsIn(paymentMethods, { message: 'wrong method' })
  method: string;

  @IsString({ message: 'description должно быть строкой (описание).' })
  @IsOptional()
  @IsOptional()
  description?: string = '';

  @IsString({ message: 'paymentId должно быть строкой (paymentId).' })
  @IsOptional()
  @IsOptional()
  paymentId?: string = '';

  // Выбранный терминал
  @IsString()
  @IsOptional()
  @IsIn(['Терминал Изинеон СБП', 'Терминал Изинеон', 'Терминал ИзиБук', ''], {
    message: 'Выбранный терминал недоступен.',
  })
  terminal?: string;

  @IsBoolean({ message: 'reservation должно быть true или false (бронь?).' })
  @IsOptional()
  reservation: boolean = false;

  @IsString({ message: 'period должно быть строкой (период).' })
  @IsOptional()
  @IsNotEmpty()
  period?: string;

  @IsInt({ message: 'dealId должен быть целым числом (ID сделки).' })
  dealId: number;

  @IsInt({ message: 'userId должен быть целым числом (ID пользователя).' })
  userId: number;

  @IsBoolean({
    message: 'isConfirmed должно быть true или false (подтвержден?).',
  })
  @IsOptional()
  isConfirmed: boolean = false;
}
