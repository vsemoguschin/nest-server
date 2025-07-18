import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserDto } from '../users/dto/user.dto';
import { UpdatePlanDto } from './dto/plan-update.dto';

@Injectable()
export class ManagersService {
  constructor(private prisma: PrismaService) {}

  async getManagers(currentUser: UserDto) {
    const workspacesSearch =
      currentUser.role.department === 'administration' ||
      currentUser.role.shortName === 'KD'
        ? { gt: 0 }
        : currentUser.workSpaceId;
    return this.prisma.user.findMany({
      where: {
        workSpaceId: workspacesSearch, // Фильтр по рабочему пространству текущего пользователя
        deletedAt: null, // Исключаем удаленных пользователей
        role: {
          department: 'COMMERCIAL',
        },
      },
      select: {
        id: true,
        fullName: true,
        workSpace: {
          select: {
            title: true,
          },
        },
      },
      orderBy: {
        fullName: 'asc', // Сортировка по имени (опционально)
      },
    });
  }

  async setPlan(managerId: number, updatePlanDto: UpdatePlanDto) {
    // Проверяем существование пользователя
    const user = await this.prisma.user.findUnique({
      where: { id: managerId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`Менеджер с ID ${managerId} не найден`);
    }

    // Ищем существующий план за период
    const existingPlan = await this.prisma.managersPlan.findFirst({
      where: {
        userId: managerId,
        period: updatePlanDto.period, // Например, "2025-02"
        deletedAt: null, // Исключаем мягко удаленные планы
      },
    });

    if (existingPlan) {
      // Если план существует, обновляем его
      return this.prisma.managersPlan.update({
        where: { id: existingPlan.id },
        data: {
          plan: updatePlanDto.plan,
        },
      });
    } else {
      // Если плана нет, создаем новый
      return this.prisma.managersPlan.create({
        data: {
          period: updatePlanDto.period,
          plan: updatePlanDto.plan,
          userId: managerId,
        },
      });
    }
  }

  async changeInternStatus(managerId: number, update: { isIntern: boolean }) {
    // Проверяем существование пользователя
    const user = await this.prisma.user.findUnique({
      where: { id: managerId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException(`Менеджер с ID ${managerId} не найден или уволен`);
    }
    return await this.prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        isIntern: update.isIntern,
      },
    });
  }
}
