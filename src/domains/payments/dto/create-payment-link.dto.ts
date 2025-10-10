import {
  IsInt,
  IsString,
  IsNotEmpty,
  Min,
  IsEmail,
  Matches,
  ValidateIf,
  IsIn,
} from 'class-validator';

export class CreatePaymentLinkDto {
  // Название заказа
  @IsString()
  @IsNotEmpty({ message: 'Название заказа не может быть пустым' })
  Name: string;

  // Стоимость заказа
  @IsInt({ message: 'Стоимость должна быть целым числом.' })
  @Min(10, { message: 'Стоимость должна быть больше или равна 10.' })
  Amount: number;

  // Телефон плательщика
  @ValidateIf((o) => !o.Email) // Проверяем, если Email не указан, то Phone обязателен
  @IsString()
  @Matches(/^\+7\d{10}$/, {
    message: 'Телефон должен быть в формате +7XXXXXXXXXXX.',
  })
  @IsNotEmpty({ message: 'Телефон обязателен, если не указан Email.' })
  Phone?: string;

  // Email плательщика
  @ValidateIf((o) => !o.Phone) // Проверяем, если Phone не указан, то Email обязателен
  @IsEmail({}, { message: 'Некорректный Email.' })
  @IsNotEmpty({ message: 'Email обязателен, если не указан телефон.' })
  Email?: string;

  // Выбранный терминал
  @IsString()
  @IsNotEmpty({ message: 'Терминал не может быть пустым.' })
  @IsIn(['Терминал Изинеон СБП', 'Терминал Изинеон', 'Терминал ИзиБук'], {
    message: 'Выбранный терминал недоступен.',
  })
  terminal: string;
}
