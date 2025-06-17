import { IsInt, IsString, Min, Matches } from 'class-validator';

export class PackerShiftResponseDto {
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
}
