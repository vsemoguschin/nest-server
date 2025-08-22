// task-orders/dto/neon.dto.ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class NeonDto {
  @IsOptional() @IsInt() id?: number;
  @IsString() width!: string;
  @IsInt() @Min(0) length!: number;
  @IsString() color!: string;
}
