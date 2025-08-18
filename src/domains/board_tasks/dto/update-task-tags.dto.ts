import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTaskTagsDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  @IsOptional()
  tags?: string[]; // массив имён тегов; отсутствие/пусто = снять все теги
}
