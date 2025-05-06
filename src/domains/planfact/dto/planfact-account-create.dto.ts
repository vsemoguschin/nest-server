import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

const types = ['Безналичный', 'Наличный'];

export class PlanFactAccountCreateDto {
  @IsString()
  @Length(1, 255)
  name: string; // Название

  @IsString()
  @Length(1, 255)
  accountNumber: string; // Номер счета

  @IsString({ message: 'Дата оплаты должно быть строкой.' })
  @Matches(
    /^\d{4}-\d{2}-\d{2}$/, // Проверка формата "YYYY-MM-DD"
    { message: 'Дата должна быть в формате YYYY-MM-DD' },
  )
  @IsDateString(
    {},
    { message: 'Дата оплаты должна быть валидной датой в формате YYYY-MM-DD' },
  )
  balanceStartDate: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  balance?: number; // Остаток

  // @IsIn(types, { message: 'Неверный тип' })
  // type?: string; // безналичны/наличный

  @IsOptional()
  @IsString()
  comment?: string; // коментарий

  @IsOptional()
  @IsBoolean()
  isReal?: boolean; // есть доступ по АПИ
}
