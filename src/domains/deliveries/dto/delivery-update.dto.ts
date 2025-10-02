import { PartialType } from '@nestjs/swagger';
import { DeliveryCreateDto } from './delivery-create.dto';
import { IsInt, IsOptional } from 'class-validator';

export class DeliveryUpdateDto extends PartialType(DeliveryCreateDto) {
  @IsOptional()
  @IsInt()
  dealId?: number;
}

