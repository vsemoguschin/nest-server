import { IsDateString, IsInt, IsNotEmpty, Matches, Min } from 'class-validator';

export class CreateRovReportDto {
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Дата должна быть в формате YYYY-MM-DD',
  })
  @IsDateString(
    {},
    { message: 'date должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  takenToDesign: number;

  @IsInt()
  @Min(0)
  @IsNotEmpty()
  sentToProduction: number;

  @IsInt()
  @IsNotEmpty()
  groupId: number;
}
