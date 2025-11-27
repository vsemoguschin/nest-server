import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsEmail,
  Min,
} from 'class-validator';

export class CreatePaymentLinkFromDraftDto {
  @IsString()
  @IsNotEmpty({ message: 'Название заказа не может быть пустым' })
  name: string;

  @IsInt({ message: 'Стоимость должна быть целым числом.' })
  @Min(10, { message: 'Стоимость должна быть больше или равна 10.' })
  amount: number; // в рублях

  @IsString()
  @IsNotEmpty({ message: 'Описание не может быть пустым' })
  description: string;

  @IsString()
  @IsNotEmpty({ message: 'Терминал не может быть пустым.' })
  terminal: string;

  @IsEmail({}, { message: 'Некорректный Email.' })
  @IsNotEmpty({ message: 'Email обязателен.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Внутренний токен обязателен' })
  internalToken: string;
}

