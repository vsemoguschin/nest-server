import {
  IsString,
  IsInt,
  IsNotEmpty,
  Matches,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateDopDto {
  @IsString({ message: 'Дата продажи должна быть строкой.' })
  @IsNotEmpty({ message: 'Дата продажи обязательна.' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата продажи должна быть в формате YYYY-MM-DD.',
  })
  @IsDateString(
    {},
    {
      message: 'Дата продажи должна быть валидной датой в формате YYYY-MM-DD.',
    },
  )
  saleDate: string;

  @IsString({ message: 'Тип допа должен быть строкой.' })
  @IsNotEmpty({ message: 'Тип допа обязателен.' })
  type: string;

  @IsInt({ message: 'Стоимость должна быть целым числом.' })
  @IsNotEmpty({ message: 'Стоимость обязательна.' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsString({ message: 'Описание должно быть строкой.' })
  // @IsNotEmpty({
  //   message:
  //     'Описание не может быть пустым, используйте пустую строку по умолчанию.',
  // })
  description?: string = ''; // Опционально, по умолчанию пустая строка

  @IsInt({ message: 'ID сделки должен быть целым числом.' })
  @IsNotEmpty({ message: 'ID сделки обязателен.' })
  @Min(1, { message: 'Выбери сделку.' })
  dealId: number;

  @IsInt({ message: 'ID пользователя должен быть целым числом.' })
  @IsNotEmpty({ message: 'ID пользователя обязателен.' })
  @Min(1, { message: 'Менеджер не выбран.' })
  userId: number;
}
