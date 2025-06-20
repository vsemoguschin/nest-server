import {
  IsString,
  IsBoolean,
  IsInt,
  IsDateString,
  MinLength,
  Min,
  IsOptional,
} from 'class-validator';

export class UpdatePackerReportDto {
  @IsOptional()
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsString({ message: 'Название должно быть строкой' })
  @MinLength(1, { message: 'Название не может быть пустым' })
  name?: string;

  @IsOptional()
  @IsBoolean({ message: 'Негабарит должен быть булевым значением' })
  overSize?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Подарок должен быть булевым значением' })
  isGift?: boolean;

  @IsOptional()
  @IsInt({ message: 'Количество вывесок должно быть целым числом' })
  @Min(0, { message: 'Количество вывесок должно быть больше 0' })
  items?: number;

  @IsOptional()
  @IsInt({ message: 'Количество блоков должно быть целым числом' })
  @Min(0, { message: 'Количество блоков должно быть больше или равно 0' })
  adapters?: number;

  @IsOptional()
  @IsInt({ message: 'Количество пленок должно быть целым числом' })
  @Min(0, { message: 'Количество пленок должно быть больше или равно 0' })
  lam?: number;

  @IsOptional()
  @IsInt({ message: 'Стоимость должна быть целым числом' })
  @Min(0, { message: 'Стоимость не может быть отрицательной' })
  cost?: number;

  @IsOptional()
  @IsInt({ message: 'Количество диммеров должно быть целым числом' })
  @Min(0, { message: 'Количество диммеров не может быть отрицательным' })
  dimmers?: number;

  @IsOptional()
  @IsInt({ message: 'Цена за допы должно быть целым числом' })
  @Min(0, { message: 'Цена за допы должно быть больше 0' })
  dops?: number;

  @IsOptional()
  @IsString({ message: 'Коммент должно быть строкой' })
  dopsComment?: string;
}
