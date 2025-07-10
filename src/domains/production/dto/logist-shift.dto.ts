import { IsInt, IsString, Min, Matches, IsArray } from 'class-validator';

export class LogistShiftResponseDto {
  @IsInt({ message: 'ID должен быть целым числом' })
  @Min(1, { message: 'ID должен быть больше 0' })
  id: number;

  @IsString({ message: 'Дата смены должна быть строкой' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата смены должна быть в формате YYYY-MM-DD',
  })
  shift_date: string;

  @IsInt({ message: 'ID пользователя должен быть целым числом' })
  @Min(1, { message: 'ID пользователя должен быть больше 0' })
  userId: number;

  @IsInt({ message: 'Стоимость должен быть целым числом' })
  @Min(0, { message: 'Стоимость должен быть больше 0' })
  cost: number;
}

export class CreateLogistShiftsDto {
  @IsString({ message: 'Период должен быть строкой' })
  @Matches(/^\d{4}-\d{2}$/, { message: 'Период должен быть в формате YYYY-MM' })
  period: string;

  @IsArray({ message: 'Даты смен должны быть массивом' })
  @IsString({ each: true, message: 'Каждая дата смены должна быть строкой' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    each: true,
    message: 'Каждая дата смены должна быть в формате YYYY-MM-DD',
  })
  shiftDates: string[];
}
