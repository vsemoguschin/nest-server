import { PartialType } from '@nestjs/swagger';
import { CreateCrmTagDto } from './create-crm-tag.dto';

export class UpdateCrmTagDto extends PartialType(CreateCrmTagDto) {}
