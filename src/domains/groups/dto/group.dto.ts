import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserDto } from 'src/domains/users/dto/user.dto';

// DTO для группы
export class GroupDto {
  @ApiProperty({ example: 1, description: 'ID группы' })
  @IsInt()
  id: number;

  @ApiProperty({ example: 'Marketing', description: 'Название группы' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ example: 1, description: 'ID рабочего пространства' })
  @IsInt()
  workSpaceId: number;

  @ApiProperty({ type: [UserDto], description: 'Пользователи в группе', required: false })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UserDto)
  users?: UserDto[];
}