// src/domains/tasks/dto/move-task.dto.ts
import { IsInt, IsOptional, Min } from 'class-validator'

export class MoveTaskDto {
  @IsInt() @Min(1)
  toColumnId: number

  // позиция опциональна: можно прислать индекс (1..N) после DnD;
  // если не придёт — вычислим между соседями/в конец
  @IsOptional()
  @IsInt() @Min(1)
  position?: number

  // альтернативно — поддержка “после какой задачи”
  @IsOptional()
  @IsInt() @Min(1)
  afterTaskId?: number
}
