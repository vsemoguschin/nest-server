// task-orders/dto/lighting.dto.ts
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class LightingDto {
  @IsOptional() @IsInt() id?: number
  @IsNumber() @Min(0) length!: number
  @IsString() color!: string
  @IsInt() @Min(0) elements!: number
}
