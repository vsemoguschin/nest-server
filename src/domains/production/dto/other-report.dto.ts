import { IsString, IsDateString, IsNumber, IsOptional } from 'class-validator';

export class CreateOtherReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @IsString({ message: 'Название должен быть строкой' })
  name: string;

  @IsString({ message: 'Стоимость должна быть строкой' })
  cost: string;

  @IsNumber({}, { message: 'ID пользователя должен быть числом' })
  userId: number;
}

export class UpdateOtherReportDto {
  @IsOptional()
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsString({ message: 'Название должен быть строкой' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Стоимость должна быть строкой' })
  cost?: string;
}