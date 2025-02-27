import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWorkspaceGroupDto {
  @ApiProperty({ description: 'Название группы', example: 'Admin Group' })
  @IsNotEmpty({ message: 'Название группы не должно быть пустым' })
  @IsString({ message: 'Название группы должно быть строкой' })
  title: string;
}
