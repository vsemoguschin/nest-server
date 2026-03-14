import { IsString, MaxLength } from 'class-validator';

export class CodexCancelDto {
  @IsString()
  @MaxLength(255)
  requestId: string;
}
