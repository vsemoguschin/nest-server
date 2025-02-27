import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const departments = ['administration', 'COMMERCIAL', 'DESIGN', 'PRODUCTION'];

export class CreateWorkspaceDto {
  @ApiProperty({ description: 'Название рабочего пространства' })
  @IsNotEmpty({ message: 'Поле title не должно быть пустым' })
  @IsString({ message: 'Поле title должно быть строкой' })
  title: string;


  @IsString({ message: 'Поле department не должно быть пустым' })
  @IsIn(departments, {message: 'Неверный департамент'})
  department: string;
}
