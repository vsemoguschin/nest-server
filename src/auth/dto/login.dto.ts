import {  IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'Email пользователя',
  })
  @IsString()
  email: string;

  @ApiProperty({
    example: 'secretPassword',
    description: 'Пароль пользователя',
  })
  @IsNotEmpty({ message: 'Пароль не должен быть пустым' })
  password: string;
}
