import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import { PaymentsService } from './payments.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

@UseGuards(RolesGuard)
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать платеж',
    description: 'Endpoint: POST /payments. Создает новый платеж.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async create(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: UserDto,
  ): Promise<CreatePaymentDto> {
    return this.paymentsService.create(createPaymentDto, user);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить платеж',
    description: 'Endpoint: DELETE /payments/:id. Удаляет платеж по id.',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.delete(id);
  }

  @Post('link')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async createPaymentLink(@Body() dto: CreatePaymentLinkDto) {
    return this.paymentsService.createLink(dto);
  }
}
