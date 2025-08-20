// boards-members/dto/board-id.dto.ts
import { IsInt, Min } from 'class-validator';

export class BoardIdDto {
  @IsInt()
  @Min(1)
  boardId!: number;
}
