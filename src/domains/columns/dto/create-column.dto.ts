import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateColumnDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  // Необязательная позиция; если не передать — выставим max+1
  @IsOptional()
  @IsNumber()
  position?: number;
}
