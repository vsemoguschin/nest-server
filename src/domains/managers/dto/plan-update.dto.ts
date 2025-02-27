import { IsString, IsInt, IsNotEmpty, Matches } from 'class-validator';

export class UpdatePlanDto {
  @IsString({ message: 'Период должен быть строкой.' })
  @IsNotEmpty({ message: 'Период обязателен.' })
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'Период должен быть в формате YYYY-MM (например, 2025-02).',
  })
  period: string;

  @IsInt({ message: 'План должен быть целым числом.' })
  @IsNotEmpty({ message: 'План обязателен.' })
  plan: number;
}
