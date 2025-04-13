import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import { PaymentsService } from './payments.service';

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
    summary: 'Удалить группу',
    description: 'Endpoint: DELETE /groups/:id. Удаляет группу по id.',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.delete(id);
  }

  @Get('operations')
  @Roles('ADMIN', 'G', 'KD')
  async getRopsReportsFromRange(
    @CurrentUser() user: UserDto,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      throw new BadRequestException(
        'Параметр start обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      throw new BadRequestException(
        'Параметр end обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.paymentsService.getOperationsFromRange(
      { from: start, to: end },
      user,
    );
  }
}
