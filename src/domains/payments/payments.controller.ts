import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  BadRequestException,
  DefaultValuePipe,
  ParseArrayPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import { PaymentsService } from './payments.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';

type PaymentListItem = {
  id: number;
  dealId: number;
  method: string;
  price: number;
  dealTitle: string;
  dealSaleDate: string;
  userFullName: string;
  userId: number;
  date: string;
  isConfirmed: boolean;
};

type PaymentListResponse = {
  totalPaymentPrice: number;
  items: PaymentListItem[];
};

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
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV')
  @ApiOperation({
    summary: 'Удалить платеж',
    description: 'Endpoint: DELETE /payments/:id. Удаляет платеж по id.',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ) {
    return this.paymentsService.delete(id, user);
  }

  @Get('group/:groupId')
  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'MOP',
    'ROP',
    'ROV',
    'MOV',
    'LOGIST',
    'MARKETER',
    'ASSISTANT',
  )
  async getList(
    @CurrentUser() user: UserDto,
    @Query('from') from: string,
    @Query('to') to: string,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query(
      'managersIds',
      new ParseArrayPipe({ items: Number, optional: true, separator: ',' }),
    )
    managersIds?: number[],
  ): Promise<PaymentListResponse> {
    if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      throw new BadRequestException(
        'Параметр from обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new BadRequestException(
        'Параметр to обязателен и должен быть в формате YYYY-MM-DD (например, 2025-01-01).',
      );
    }
    return this.paymentsService.getList(
      user,
      from,
      to,
      groupId,
      take,
      page,
      managersIds,
    );
  }

  @Post('link')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async createPaymentLink(@Body() dto: CreatePaymentLinkDto) {
    return this.paymentsService.createLink(dto);
  }

  @Get('checkPayment')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async checkPayment(
    @Query('paymentId') paymentId: string,
    @Query('terminal') terminal: string,
  ) {
    return this.paymentsService.checkPayment(paymentId, terminal);
  }

  @Get('checkPaymentLink')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async checkPaymentByLink(@Query('link') link: string) {
    return this.paymentsService.checkPaymentByLink(link);
  }
}
