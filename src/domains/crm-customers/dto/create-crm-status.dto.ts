import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateCrmStatusDto {
  @ApiProperty({
    description: 'ID CRM-аккаунта',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId: number;

  @ApiProperty({
    description: 'Название статуса',
    example: 'Новый клиент',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    description: 'Цвет статуса',
    example: '#22c55e',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  color: string;

  @ApiProperty({
    description: 'Тип статуса',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  type: number;
}
