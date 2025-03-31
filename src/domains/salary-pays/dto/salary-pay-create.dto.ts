import { IsString, IsInt, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Перечисление для статуса
const salaryPayStatuses = ['Создана', 'Выплачена'];

export class SalaryPayCreateDto {
  @ApiProperty({
    description: 'Дата выплаты',
    example: '2025-01-12',
  })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({
    description: 'Период выплаты (например, YYYY-MM)',
    example: '2025-01',
    default: '',
  })
  @IsString()
  period: string = ''; // Значение по умолчанию

  @ApiProperty({
    description: 'Сумма выплаты',
    example: 50000,
  })
  @IsInt()
  @IsNotEmpty()
  price: number;

  @ApiProperty({
    description: 'Статус выплаты',
    enum: salaryPayStatuses,
    default: salaryPayStatuses[0],
  })
  @IsIn(salaryPayStatuses, {
    message: `Статус должен из: ${salaryPayStatuses.join(', ')}`,
  })
  status: string = salaryPayStatuses[0]; // Статус по умолчанию

  @ApiProperty({
    description: 'ID пользователя',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  userId: number;
}
