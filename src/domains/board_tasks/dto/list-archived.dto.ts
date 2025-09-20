import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListArchivedDto {
  @ApiProperty({ example: 1, description: 'ID доски', required: true })
  @Transform(({ value }) => Number(value))
  boardId!: number;

  @ApiProperty({
    example: 20,
    required: false,
    description: 'Лимит результатов',
  })
  @IsOptional()
  @Transform(({ value }) => (value !== undefined ? Number(value) : 20))
  @IsInt()
  @Min(1)
  take?: number = 30;

  @ApiProperty({
    example:
      'eyJpZCI6MTAxLCJ1cGRhdGVkQXQiOiIyMDI1LTA5LTE5VDEyOjM0OjU2WiJ9',
    required: false,
    description: 'Курсор пагинации (Base64 JSON)',
  })
  @IsOptional()
  @IsString()
  cursor?: string;
}
