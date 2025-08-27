import {
  IsString,
  IsDateString,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class CreateOtherReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @IsString({ message: 'Название должен быть строкой' })
  name: string;

  @IsInt({ message: 'Стоимость должна быть целым числом' })
  @Min(0, { message: 'Стоимость не может быть отрицательной' })
  cost: number;

  @IsNumber({}, { message: 'ID пользователя должен быть числом' })
  userId: number;

  @IsString()
  @IsOptional()
  comment?: string;
}

export class UpdateOtherReportDto {
  @IsOptional()
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsString({ message: 'Название должен быть строкой' })
  name?: string;

  @IsOptional()
  @IsInt({ message: 'Стоимость должна быть целым числом' })
  @Min(0, { message: 'Стоимость не может быть отрицательной' })
  cost?: number;

  @IsString()
  @IsOptional()
  comment?: string;
}
