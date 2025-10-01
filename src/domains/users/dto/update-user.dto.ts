// src/users/dto/update-user.dto.ts
import { IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class UpdateUserDto {
  // Имя пользователя
  @IsOptional()
  @IsString()
  fullName?: string;

  // Telegram username или ссылка
  @IsOptional()
  @IsString()
  tg?: string;

  // Числовой Telegram ID; null — очистить
  @ValidateIf((_, value) => value === null || typeof value === 'number' || value === undefined)
  @IsOptional()
  @IsInt()
  @Min(0)
  tg_id?: number | null;

  // ID роли
  @IsOptional()
  @IsInt()
  @Min(1)
  roleId?: number;
}
