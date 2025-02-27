import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsIn } from 'class-validator';
const departments = ['administrations', 'DESIGN', 'COMMERCIAL', 'PRODUCTION'];

export class RoleDto {
  @ApiProperty({ example: 1, description: 'ID роли' })
  id: number;

  @ApiProperty({ example: 'admin', description: 'Короткое имя роли' })
  @IsNotEmpty()
  @IsString()
  shortName: string;

  @ApiProperty({ example: 'Administrator', description: 'Полное имя роли' })
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty({ message: 'Поле department не должно быть пустым' })
  @IsIn(departments, {
    message:
      'Поле department должно быть одним из: administration, COMMERCIAL, DESIGN, PRODUCTION',
  })
  department: string;

  @ApiProperty({
    example: null,
    description: 'Дата мягкого удаления',
    required: false,
  })
  deletedAt?: Date | null;
}
