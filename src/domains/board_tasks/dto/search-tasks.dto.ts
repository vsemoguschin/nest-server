import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class SearchTasksDto {
  @ApiProperty({ example: 't.me/room', description: 'Подстрока в chatLink' })
  @IsString()
  @Length(2, 2048)
  q!: string;

  @ApiProperty({
    example: 20,
    required: false,
    description: 'Лимит результатов',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 20))
  @IsInt()
  @Min(1)
  take?: number = 20;
}
