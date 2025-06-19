import { IsString, IsNumber, IsDateString, IsIn } from 'class-validator';

export class CreateMasterReportDto {
  @IsDateString()
  date: string;

  @IsString()
  name: string;

  @IsNumber()
  metrs: number;

  @IsNumber()
  els: number;

  @IsString()
  @IsIn([
    'Стандартная',
    'Уличная',
    'РГБ',
    'Смарт',
    'Контражур',
    'ВБ',
    'ОЗОН',
    'Подарок',
    'Ремонт',
  ])
  type: string;

  @IsNumber()
  cost: number;

  @IsNumber()
  userId: number;
}
