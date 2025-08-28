// src/users/dto/update-user.dto.ts
import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  tg_id?: number; // 0 допустим, если хотите "очистить"
}
