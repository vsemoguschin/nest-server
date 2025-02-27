import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsIn,
  IsOptional,
  ValidateNested,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GroupDto } from 'src/domains/groups/dto/group.dto';
import { UserDto } from 'src/domains/users/dto/user.dto';
const departments = ['administrations', 'DESIGN', 'COMMERCIAL', 'PRODUCTION'];


// DTO для рабочего пространства
export class WorkSpaceDto {
  @ApiProperty({ example: 1, description: 'ID рабочего пространства' })
  @IsInt()
  id: number;

  @ApiProperty({
    example: 'Main Office',
    description: 'Название рабочего пространства',
  })
  @IsNotEmpty()
  @IsString()
  title: string;

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
  @IsOptional()
  deletedAt?: Date | null;

  @ApiProperty({
    type: [GroupDto],
    description: 'Группы в рабочем пространстве',
    required: false,
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GroupDto)
  groups?: GroupDto[];

  @ApiProperty({
    type: [UserDto],
    description: 'Пользователи в рабочем пространстве',
    required: false,
  })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UserDto)
  users?: UserDto[];
}
