import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class AssistantPlaygroundRespondDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  parentMessageId?: string;

  @IsOptional()
  @IsIn(['vk', 'telegram', 'crm', 'other'])
  channel?: 'vk' | 'telegram' | 'crm' | 'other';

  @IsOptional()
  @IsString()
  customerContext?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(32)
  @Max(2000)
  maxOutputTokens?: number;
}
