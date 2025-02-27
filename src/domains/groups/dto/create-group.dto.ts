import { IsNotEmpty, IsString, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ description: 'Название группы', example: 'Admin G' })
  @IsNotEmpty({ message: 'Название группы не должно быть пустым' })
  @IsString({ message: 'Название группы должно быть строкой' })
  title: string;

  @ApiProperty({
    description: 'Идентификатор рабочего пространства',
    example: 1,
  })
  @IsNotEmpty({
    message: 'Идентификатор рабочего пространства не должен быть пустым',
  })
  @IsInt({ message: 'Идентификатор рабочего пространства должен быть числом' })
  workSpaceId: number;
}
