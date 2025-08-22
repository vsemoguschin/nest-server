// task-orders/dto/update-task-order.dto.ts
import { PartialType } from '@nestjs/mapped-types'
import { CreateTaskOrderDto } from './order.dto';
export class UpdateTaskOrderDto extends PartialType(CreateTaskOrderDto) {}
