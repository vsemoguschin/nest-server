import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsInt,
  Min,
  IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: 'Полное имя пользователя' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({ description: 'Email пользователя' })
  @IsNotEmpty()
  // @IsEmail()
  email: string;

  @ApiProperty({ description: 'Пароль пользователя' })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({
    description: 'Дополнительная информация о пользователе',
    required: false,
  })
  @IsOptional()
  @IsString()
  info?: string;

  @ApiProperty({
    description: 'Ссылка на Telegram пользователя',
    required: false,
  })
  @IsOptional()
  @IsString()
  tg?: string;

  @ApiProperty({
    description: 'Telegram ID пользователя',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  tg_id?: number;

  @ApiProperty({
    description: 'Статус пользователя',
    required: false,
    default: '',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ description: 'ID роли пользователя' })
  @IsNotEmpty()
  @IsInt()
  roleId: number;

  @ApiProperty({
    description:
      'Идентификатор рабочего пространства, к которому принадлежит пользователь',
  })
  @IsNotEmpty({ message: 'Поле workSpaceId не должно быть пустым' })
  @IsNumber()
  workSpaceId: number;

  @ApiProperty({
    description: 'Идентификатор группы, к которому принадлежит пользователь',
  })
  @IsNotEmpty({ message: 'Поле groupId не должно быть пустым' })
  @IsNumber()
  groupId: number;
}
