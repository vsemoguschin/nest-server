import { PartialType } from '@nestjs/swagger';
import { CreateCrmStatusDto } from './create-crm-status.dto';

export class UpdateCrmStatusDto extends PartialType(CreateCrmStatusDto) {}
