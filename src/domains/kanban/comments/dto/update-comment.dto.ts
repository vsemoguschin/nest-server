import { IsString, MaxLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @MaxLength(10_000)
  text!: string;
}
