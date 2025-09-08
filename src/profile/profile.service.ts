// Пример для ProfileService
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfileDto } from 'src/profile/dto/user-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, boards: true }, // Включаем связанную модель Role
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const boardsIds = user?.boards.map((b) => b.id);

    const avaliableBoards = await this.prisma.board.findMany({
      where: {
        id: ['ADMIN', 'G'].includes(user?.role.shortName)
          ? { gt: 0 }
          : { in: boardsIds },
      },
    });

    const { password, boards, ...userData } = user;
    return {
      ...userData,
      boards: avaliableBoards.map((b) => ({ id: b.id, title: b.title })),
    };
  }
}
