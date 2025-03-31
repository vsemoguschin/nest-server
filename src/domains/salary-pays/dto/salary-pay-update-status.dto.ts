import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Перечисление для статуса
const salaryPayStatuses = ['Создана', 'Выплачена'];

export class SalaryPayUpdateStatusDto {
  @ApiProperty({
    description: 'Статус выплаты',
    enum: salaryPayStatuses,
    default: salaryPayStatuses[0],
  })
  @IsIn(salaryPayStatuses, {
    message: `Статус должен из: ${salaryPayStatuses.join(', ')}`,
  })
  status: string = salaryPayStatuses[0]; // Статус по умолчанию
}
