import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
// Если используете enum, можно либо импортировать его из @prisma/client (если он там есть), либо определить локально.
const departments = ['administrations', 'DESIGN', 'COMMERCIAL', 'PRODUCTION'];

export class CreateRoleDto {
  @ApiProperty({ description: 'Краткое наименование роли' })
  @IsNotEmpty({ message: 'Поле shortName не должно быть пустым' })
  @IsString({ message: 'Поле shortName должно быть строкой' })
  shortName: string;

  @ApiProperty({ description: 'Полное наименование роли' })
  @IsNotEmpty({ message: 'Поле fullName не должно быть пустым' })
  @IsString({ message: 'Поле fullName должно быть строкой' })
  fullName: string;

  @ApiProperty({
    description: 'Отдел, к которому относится роль',
  })
  @IsNotEmpty({ message: 'Поле department не должно быть пустым' })
  @IsIn(departments, {
    message:
      'Поле department должно быть одним из: administration, COMMERCIAL, DESIGN, PRODUCTION',
  })
  department: string;
}
