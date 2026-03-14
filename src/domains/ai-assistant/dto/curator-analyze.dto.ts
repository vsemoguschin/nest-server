import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CuratorSourceReferenceDto {
  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsString()
  messageRange?: string;

  @IsOptional()
  @IsString()
  snapshotReference?: string;
}

export class CuratorConversationMessageDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsIn(['customer', 'assistant', 'manager', 'system'])
  role!: 'customer' | 'assistant' | 'manager' | 'system';

  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  createdAt?: string;
}

export class CuratorConversationContextDto {
  @ValidateNested({ each: true })
  @Type(() => CuratorConversationMessageDto)
  @IsArray()
  messages!: CuratorConversationMessageDto[];

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  crmContext?: Record<string, unknown>;
}

export class CuratorAnalyzeDto {
  @IsString()
  @IsNotEmpty()
  conversationId!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CuratorSourceReferenceDto)
  sourceReference?: CuratorSourceReferenceDto;

  @ValidateNested()
  @Type(() => CuratorConversationContextDto)
  conversationContext!: CuratorConversationContextDto;

  @IsOptional()
  @IsObject()
  reviewRecord?: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  curatorQuestion!: string;
}
