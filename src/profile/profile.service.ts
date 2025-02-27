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
      include: { role: true }, // Включаем связанную модель Role
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    const { password, ...userData } = user; 
    return userData;
  }
}
