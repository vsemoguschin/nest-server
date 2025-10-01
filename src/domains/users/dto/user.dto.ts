import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsArray,
} from 'class-validator';
import { RoleDto } from 'src/domains/roles/dto/role.dto';
import { WorkSpaceDto } from 'src/domains/workspaces/dto/workspace.dto';

export class UserDto {
  @ApiProperty({ example: 1, description: 'ID пользователя' })
  id: number;

  @ApiProperty({ example: 'John Doe', description: 'Полное имя пользователя' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Email пользователя',
  })
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({
    example: 'hashedPassword',
    description: 'Хэш пароля',
    required: false,
  })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({
    example: 'Some info',
    description: 'Информация о пользователе',
    required: false,
  })
  @IsString()
  @IsOptional()
  info?: string;

  @ApiProperty({
    example: 'tgUsername',
    description: 'Telegram username',
    required: false,
  })
  @IsString()
  @IsOptional()
  tg?: string;

  @ApiProperty({
    example: 123456789,
    description: 'Telegram ID',
    required: false,
  })
  @IsInt()
  @IsOptional()
  tg_id?: number;

  @ApiProperty({
    example: 'Active',
    description: 'Статус пользователя',
    required: false,
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({
    example: null,
    description: 'Дата мягкого удаления',
    required: false,
  })
  deletedAt?: Date | null;

  @ApiProperty({ example: 1, description: 'ID роли пользователя' })
  @IsInt()
  roleId: number;

  @ApiProperty({
    type: () => RoleDto,
    description: 'Роль пользователя',
    required: false,
  })
  role: RoleDto; // Опционально, если нужно включить роль

  @ApiProperty({
    type: () => WorkSpaceDto,
    description: 'пространство пользователя',
    required: false,
  })
  workSpace: WorkSpaceDto; // Опционально, если нужно включить роль
  group: {
    id: number;
    title: string;
  }; // Опционально, если нужно включить роль

  @ApiProperty({ example: 1, description: 'ID рабочего пространства' })
  @IsInt()
  workSpaceId: number;

  @ApiProperty({ example: 1, description: 'ID группы' })
  @IsInt()
  groupId: number;

  //isIntern, optional, default false
  @ApiProperty({
    example: false,
    description: 'Является ли пользователь стажером',
    required: false,
  })
  @IsOptional()
  @IsString()
  isIntern?: boolean = false;

  @IsArray()
  boards: { id: number }[];
}
