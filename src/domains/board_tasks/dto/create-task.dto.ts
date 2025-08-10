import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ArrayUnique,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTaskDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  /** Необязательная явная позиция; если не передать — вычислим max+1 */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  position?: number;

  /** IDs пользователей, которых сразу назначаем участниками */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  memberIds?: number[];

  /** Теги, создадим записи KanbanTaskTags */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Type(() => String)
  tags?: string[];
}
