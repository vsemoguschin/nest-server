import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPaymentDto: CreatePaymentDto, user: UserDto) {
    const newPayment = await this.prisma.payment.create({
      data: {
        ...createPaymentDto,
        userId: user.id,
        period: createPaymentDto.date.slice(0, 7),
      },
    });
    return newPayment;
  }

  async delete(id: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Платеж с id ${id} не найден.`);
    }
    return await this.prisma.payment.delete({ where: { id } });
  }
}
