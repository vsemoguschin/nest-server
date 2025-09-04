import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { RoleDto } from '../../domains/roles/dto/role.dto'; // Импортируем модель RoleDto

export class UserProfileDto {
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
    example: 'Some info',
    description: 'Информация о пользователе',
    required: false,
  })
  @IsString()
  @IsOptional()
  info?: string;

  @ApiProperty({ type: () => RoleDto, description: 'Роль пользователя' })
  role: RoleDto; // Включаем модель RoleDto

  boards: { id: number; title: string }[];
}
