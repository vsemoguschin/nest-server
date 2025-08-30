import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponse {
  @ApiProperty({ example: 400 }) status!: number; // HTTP статус
  @ApiProperty({ example: 'Bad Request' }) title!: string; // кратко
  @ApiProperty({ example: 'Email is invalid' }) detail?: string; // детали
  @ApiProperty({ example: 'VALIDATION_ERROR' }) code?: string; // ваш внутренний код
  @ApiProperty({ example: '/vsemo/users' }) instance?: string; // путь
  @ApiProperty({ example: '2025-08-29T10:15:00.000Z' }) timestamp!: string;
  @ApiProperty({ example: '9c7f2d31-...' }) traceId?: string; // по желанию
}
