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
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';
import { PaymentsService } from './payments.service';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { CreateOfferLinkDto } from './dto/create-offer-link.dto';
import { CreatePaymentLinkFromDraftDto } from './dto/create-payment-link-from-draft.dto';
import { Public } from '../../auth/public.decorator';

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

  @Get('group')
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
    @Query('take', new DefaultValuePipe(20), ParseIntPipe) take: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('groupId', new ParseIntPipe({ optional: true }))
    groupId?: number,
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
      take,
      page,
      groupId,
      managersIds,
    );
  }

  @Post('link')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async createPaymentLink(
    @Body() dto: CreatePaymentLinkDto,
    @CurrentUser() user: UserDto,
    @Req() req: Request,
  ) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || '';
    return this.paymentsService.createLink(dto, user, token);
  }

  @Post('offer-link')
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async createOfferLink(
    @Body() dto: CreateOfferLinkDto,
    @CurrentUser() user: UserDto,
    @Req() req: Request,
  ) {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.replace('Bearer ', '') || '';
    return this.paymentsService.createOfferLink(dto, token);
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

  @Post('link-from-draft')
  @Public()
  async createPaymentLinkFromDraft(@Body() dto: CreatePaymentLinkFromDraftDto) {
    // Проверка внутреннего токена для межсервисного взаимодействия
    const internalToken =
      process.env.PAYMENT_SERVICE_INTERNAL_TOKEN || 'internal-secret-token';
    if (dto.internalToken !== internalToken) {
      throw new BadRequestException('Неверный внутренний токен');
    }

    // Преобразуем DTO в формат CreatePaymentLinkDto
    const createPaymentLinkDto: CreatePaymentLinkDto = {
      Name: dto.name,
      Amount: dto.amount,
      Email: dto.email,
      Phone: '', // Не требуется для создания из предзаписи
      terminal: dto.terminal,
    };

    return this.paymentsService.createLink(createPaymentLinkDto, null, '');
  }
}
