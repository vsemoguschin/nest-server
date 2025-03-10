import {
  IsInt,
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsDateString,
  Min,
} from 'class-validator';

export class AdExpenseCreateDto {
  @IsString({ message: 'Дата продажи должно быть строкой.' })
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'Дата продажи должна быть валидной датой в формате YYYY-MM-DD' },
  )
  date: string;

  @IsInt({ message: 'price должен быть целым числом (стоимость без допов).' })
  @Min(1, { message: 'Стоимость должна быть больше нуля.' })
  price: number;

  @IsString({ message: 'period должно быть строкой (период).' })
  @IsOptional()
  @IsNotEmpty()
  period?: string;

  @IsInt({ message: 'dealSourceId должен быть целым числом (ID клиента).' })
  dealSourceId: number;
}
