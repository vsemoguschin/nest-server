import { IsString, IsInt, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Перечисление для статуса
const salaryPayTypes = ['Вычет', 'Прибавка'];

export class salaryCorrection {
  @ApiProperty({
    description: 'Дата выплаты',
    example: '2025-01-12',
  })
  @IsString()
  date: string = '';

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
    description: 'Тип выплаты',
    enum: salaryPayTypes,
    default: salaryPayTypes[0],
  })
  @IsIn(salaryPayTypes, {
    message: `Тип должен из: ${salaryPayTypes.join(', ')}`,
  })
  type: string = salaryPayTypes[0]; // Тип по умолчанию

  @ApiProperty({
    description: 'ID пользователя',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  userId: number;
}
