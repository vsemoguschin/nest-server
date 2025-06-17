import {
  IsString,
  IsBoolean,
  IsInt,
  IsDateString,
  MinLength,
  Min,
} from 'class-validator';

export class CreatePackerReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @IsString({ message: 'Название должно быть строкой' })
  @MinLength(1, { message: 'Название не может быть пустым' })
  name: string;

  @IsBoolean({ message: 'Негабарит должен быть булевым значением' })
  overSize: boolean;

  @IsBoolean({ message: 'Подарок должен быть булевым значением' })
  isGift: boolean;

  @IsInt({ message: 'Количество вывесок должно быть целым числом' })
  @Min(1, { message: 'Количество вывесок должно быть больше 0' })
  items: number;

  @IsInt({ message: 'Стоимость должна быть целым числом' })
  @Min(0, { message: 'Стоимость не может быть отрицательной' })
  cost: number;

  @IsInt({ message: 'Количество диммеров должно быть целым числом' })
  @Min(0, { message: 'Количество диммеров не может быть отрицательным' })
  dimmers: number;

  @IsInt({ message: 'ID пользователя должен быть целым числом' })
  @Min(1, { message: 'ID пользователя должен быть больше 0' })
  userId: number;
}
