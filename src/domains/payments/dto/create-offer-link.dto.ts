import {
  IsInt,
  IsString,
  IsNotEmpty,
  Min,
  IsIn,
} from 'class-validator';

export class CreateOfferLinkDto {
  // Название заказа
  @IsString()
  @IsNotEmpty({ message: 'Название заказа не может быть пустым' })
  Name: string;

  // Стоимость заказа
  @IsInt({ message: 'Стоимость должна быть целым числом.' })
  @Min(10, { message: 'Стоимость должна быть больше или равна 10.' })
  Amount: number;

  // Выбранный терминал
  @IsString()
  @IsNotEmpty({ message: 'Терминал не может быть пустым.' })
  @IsIn(['Терминал Изинеон СБП', 'Терминал Изинеон', 'Терминал ИзиБук', 'Терминал ИзиБук СБП'], {
    message: 'Выбранный терминал недоступен.',
  })
  terminal: string;
}

