import { PartialType } from '@nestjs/swagger';
import { CreateAudienceDto } from './create-audience.dto';

export class UpdateAudienceDto extends PartialType(CreateAudienceDto) {}
