import { IsOptional, IsString } from 'class-validator';

export class AdSourcesQueryDto {
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}
