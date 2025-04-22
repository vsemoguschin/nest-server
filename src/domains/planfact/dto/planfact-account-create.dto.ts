import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
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

  @IsOptional()
  @IsInt()
  @Min(0)
  balance?: number; // Остаток

  @IsIn(types, { message: 'Неверный тип' })
  type?: string; // безналичны/наличный

  @IsOptional()
  @IsString()
  comment?: string; // коментарий

  @IsOptional()
  @IsBoolean()
  isReal?: boolean; // есть доступ по АПИ
}
