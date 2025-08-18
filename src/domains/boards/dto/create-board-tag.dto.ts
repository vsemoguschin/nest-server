import { IsOptional, IsString, MinLength } from 'class-validator'

export class CreateBoardTagDto {
  @IsString()
  @MinLength(1)
  name!: string

  @IsOptional()
  @IsString()
  color?: string
}
