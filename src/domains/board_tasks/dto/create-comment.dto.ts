// dto/create-comment.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MaxLength(10_000)
  text!: string;
}
