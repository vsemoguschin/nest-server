import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto } from './dto/client-create.dto';
import { UserDto } from '../users/dto/user.dto';
import { UpdateClientDto } from './dto/client-update.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createClientDto: CreateClientDto, user: UserDto) {
    return await this.prisma.client.upsert({
      where: {
        chatLink: createClientDto.chatLink,
      },
      update: {},
      create: {
        ...createClientDto,
        userId: user.id,
        groupId: user.groupId,
        workSpaceId: user.workSpaceId,
      },
    });
  }

  async update(id: number, updateClientDto: UpdateClientDto, user: UserDto) {
    const clientExists = await this.prisma.client.findUnique({
      where: { id },
    });
    if (!clientExists) {
      throw new NotFoundException(`Клиент с ID ${id} не найден`);
    }

    // Обновляем клиента
    const updatedClient = await this.prisma.client.update({
      where: { id },
      data: {
        fullName: updateClientDto.fullName,
        phone: updateClientDto.phone,
        chatLink: updateClientDto.chatLink,
        adLink: updateClientDto.adLink,
        gender: updateClientDto.gender,
        type: updateClientDto.type,
        info: updateClientDto.info,
        inn: updateClientDto.inn,
        firstContact: updateClientDto.firstContact,
      },
    });

    return updatedClient;
  }

  async getList(chatLink: string) {
    return await this.prisma.client.findMany({
      where: {
        chatLink: {
          contains: chatLink, // Ищет, содержится ли chatLink в поле chatLink клиента
          mode: 'insensitive', // Для поиска без учета регистра (по желанию)
        },
      },
    });
  }
}
