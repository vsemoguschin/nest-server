import { IsString, IsBoolean, IsNumber, IsDateString, IsIn, IsOptional } from 'class-validator';

export class CreateMasterRepairReportDto {
  @IsDateString({}, { message: 'Дата должна быть в формате YYYY-MM-DD' })
  date: string;

  @IsString({ message: 'Название должно быть строкой' })
  name: string;

  @IsNumber({}, { message: 'Метры должны быть числом' })
  metrs: number;

  @IsNumber({}, { message: 'Элементы должны быть целым числом' })
  els: number;

  @IsString({ message: 'Тип должен быть строкой' })
  @IsIn(['Стандартная', 'Уличная', 'РГБ', 'Смарт'], { message: 'Недопустимый тип' })
  type: string;

  @IsNumber({}, { message: 'Стоимость должна быть целым числом' })
  cost: number;

  @IsNumber({}, { message: 'ID пользователя должен быть целым числом' })
  userId: number;

  @IsBoolean({ message: 'Шлифовка должна быть булевым значением' })
  grinding: boolean;

  @IsBoolean({ message: 'Распаковка стандарт должна быть булевым значением' })
  unpackage: boolean;

  @IsBoolean({ message: 'Распаковка большая должна быть булевым значением' })
  unpackageBig: boolean;

  @IsBoolean({ message: 'Контроллер должен быть булевым значением' })
  smartContr: boolean;

  @IsBoolean({ message: 'Акустика должна быть булевым значением' })
  acoustics: boolean;

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
  metrs?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Элементы должны быть целым числом' })
  els?: number;

  @IsOptional()
  @IsString({ message: 'Тип должен быть строкой' })
  @IsIn(['Стандартная', 'Уличная', 'РГБ', 'Смарт'], { message: 'Недопустимый тип' })
  type?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Стоимость должна быть целым числом' })
  cost?: number;

  @IsOptional()
  @IsBoolean({ message: 'Шлифовка должна быть булевым значением' })
  grinding?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Распаковка стандарт должна быть булевым значением' })
  unpackage?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Распаковка большая должна быть булевым значением' })
  unpackageBig?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Контроллер должен быть булевым значением' })
  smartContr?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Акустика должна быть булевым значением' })
  acoustics?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Штраф должен быть булевым значением' })
  isPenalty?: boolean;

  @IsOptional()
  @IsString({ message: 'Комментарий должен быть строкой' })
  comment?: string;
}