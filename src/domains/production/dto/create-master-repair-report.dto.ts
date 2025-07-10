import { IsString, IsBoolean, IsNumber, IsDateString, IsIn, IsOptional, Min } from 'class-validator';

export class CreateMasterRepairReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @IsString({ message: 'Название должно быть строкой' })
  name: string;

  @IsNumber({}, { message: 'Метры должны быть числом' })
  @Min(0, { message: 'Метры должны быть больше или равны нулю' })
  metrs: number;

  @IsNumber({}, { message: 'Элементы должны быть числом' })
  @Min(0, { message: 'Элементы должны быть больше или равны нулю' })
  els: number;

  @IsString({ message: 'Тип должен быть строкой' })
  @IsIn(['Стандартная', 'Уличная', 'РГБ', 'Смарт'], {
    message: 'Недопустимый тип',
  })
  type: string;

  @IsNumber({}, { message: 'Стоимость должна быть числом' })
  @Min(0, { message: 'Стоимость должна быть больше или равны нулю' })
  cost: number;

  @IsNumber({}, { message: 'ID пользователя должен быть числом' })
  @Min(0, { message: 'ID пользователя должен быть больше или равен нулю' })
  userId: number;

  @IsNumber({}, { message: 'Шлифовка должна быть числом' })
  @Min(0, { message: 'Шлифовка должна быть больше или равна нулю' })
  grinding: number;

  @IsNumber({}, { message: 'Распаковка стандарт должна быть числом' })
  @Min(0, { message: 'Распаковка стандарт должна быть больше или равна нулю' })
  unpackage: number;

  @IsNumber({}, { message: 'Распаковка большая должна быть числом' })
  @Min(0, { message: 'Распаковка большая должна быть больше или равна нулю' })
  unpackageBig: number;

  @IsNumber({}, { message: 'Контроллер должен быть числом' })
  @Min(0, { message: 'Контроллер должен быть больше или равен нулю' })
  smartContr: number;

  @IsNumber({}, { message: 'Акустика должна быть числом' })
  @Min(0, { message: 'Акустика должна быть больше или равна нулю' })
  acoustics: number;

  @IsOptional()
  @IsBoolean({ message: 'Штраф должен быть булевым значением' })
  isPenalty?: boolean;

  @IsOptional()
  @IsString({ message: 'Комментарий должен быть строкой' })
  comment?: string;
}

export class UpdateMasterRepairReportDto {
  @IsOptional()
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsString({ message: 'Название должно быть строкой' })
  name?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Метры должны быть числом' })
  @Min(0, { message: 'Метры должны быть больше или равны нулю' })
  metrs?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Элементы должны быть числом' })
  @Min(0, { message: 'Элементы должны быть больше или равны нулю' })
  els?: number;

  @IsOptional()
  @IsString({ message: 'Тип должен быть строкой' })
  @IsIn(['Стандартная', 'Уличная', 'РГБ', 'Смарт'], {
    message: 'Недопустимый тип',
  })
  type?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Стоимость должна быть числом' })
  @Min(0, { message: 'Стоимость должна быть больше или равна нулю' })
  cost?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Шлифовка должна быть числом' })
  @Min(0, { message: 'Шлифовка должна быть больше или равна нулю' })
  grinding?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Распаковка стандарт должна быть числом' })
  @Min(0, { message: 'Распаковка стандарт должна быть больше или равна нулю' })
  unpackage?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Распаковка большая должна быть числом' })
  @Min(0, { message: 'Распаковка большая должна быть больше или равна нулю' })
  unpackageBig?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Контроллер должен быть числом' })
  @Min(0, { message: 'Контроллер должен быть больше или равен нулю' })
  smartContr?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Акустика должна быть числом' })
  @Min(0, { message: 'Акустика должна быть больше или равна нулю' })
  acoustics?: number;

  @IsOptional()
  @IsBoolean({ message: 'Штраф должен быть булевым значением' })
  isPenalty?: boolean;

  @IsOptional()
  @IsString({ message: 'Комментарий должен быть строкой' })
  comment?: string;
}