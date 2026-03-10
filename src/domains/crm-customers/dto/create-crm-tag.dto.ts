import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateCrmTagDto {
  @ApiProperty({
    description: 'ID CRM-аккаунта',
    example: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  accountId: number;

  @ApiProperty({
    description: 'Название тега',
    example: 'VIP',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    description: 'Цвет фона тега',
    example: '#fde68a',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  color: string;

  @ApiProperty({
    description: 'Цвет текста тега',
    example: '#92400e',
    maxLength: 50,
  })
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  textColor: string;
}
