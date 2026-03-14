import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CodexChatDto {
  @IsString()
  @MaxLength(12000)
  prompt: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  threadId?: string;
}
