import { IsInt } from 'class-validator';

// DTO для копирования задачи на другую доску
export class CopyTaskToBoardDto {
  @IsInt()
  boardId!: number; // ID целевой доски
}

