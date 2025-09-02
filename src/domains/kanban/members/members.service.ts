import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { PrismaService } from 'src/prisma/prisma.service';
type MemberSelect = {
  id: true;
  fullName: true;
  // если есть роль у пользователя — раскомментируй
  // role: { select: { fullName: true } };
};
type AddedMember = Prisma.UserGetPayload<{ select: MemberSelect }>;

@Injectable()
export class TaskMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**Получить список участников задачи */
  async getMembers(userId: number, taskId: number) {
    // подтягиваем участников
    const res = await this.prisma.kanbanTask.findUnique({
      where: { id: taskId },
      select: {
        members: {
          where: { deletedAt: null }, // если в User есть deletedAt — фильтруем "мёртвых"
          select: {
            id: true,
            fullName: true,
            email: true,
            role: { select: { id: true, shortName: true, fullName: true } },
            avatarUrl: true,
          },
          orderBy: { fullName: 'asc' },
        },
      },
    });

    // нормализуем ответ в плоский массив
    return (res?.members ?? []).map((m) => ({
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      avatarUrl: m.avatarUrl,
      role: {
        id: m.role?.id,
        shortName: m.role?.shortName,
        fullName: m.role?.fullName,
      },
    }));
  }
  /**Получить список доступных участников для добавления в задачу */
  async getAvaliableMembers(taskId: number, boardId: number) {
    // подтягиваем участников
    const avalMem = await this.prisma.user.findMany({
      where: {
        tasks: {
          none: {
            id: taskId,
          },
        },
        boards: {
          some: {
            id: boardId,
          },
        },
      },
    });

    // нормализуем ответ в плоский массив
    return (avalMem ?? []).map((m) => ({
      id: m.id,
      fullName: m.fullName,
    }));
  }


  /**Добавить пользователя в задачу */
  async addMemberToTask(
    task: { id: number; members: { id: number }[]; boardId: number },
    userId: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (task.members.find((u) => u.id === userId)) {
        throw new ConflictException('Пользователь уже участник');
      }

      // 2) проверим, что user состоит в соответствующей доске
      const isBoardMember = await tx.user.count({
        where: {
          id: userId,
          boards: { some: { id: task.boardId } }, // many-to-many User<->Board
        },
      });
      if (!isBoardMember) {
        throw new ForbiddenException('Пользователь не участник доски');
      }

      // 3) подключаем участника к задаче (many-to-many User<->KanbanTask)
      try {
        const updated = await tx.kanbanTask.update({
          where: { id: task.id },
          data: { members: { connect: { id: userId } } },
          select: {
            members: {
              where: { id: userId },
              select: {
                id: true,
                fullName: true,
                // role: { select: { fullName: true } },
              } satisfies MemberSelect,
            },
          },
        });

        // вернём ровно добавленного участника
        return updated.members[0] as AddedMember;
      } catch (e) {
        // на гонке connect может дать duplicate (вдруг добавили параллельно)
        if (
          e instanceof PrismaClientKnownRequestError &&
          e.code === 'P2002' // Unique constraint failed
        ) {
          throw new ConflictException('User is already a task member');
        }
        throw e;
      }
    });
  }

  /**
   * Удалить пользователя из участников задачи.
   * Бросает 404, если пользователь не состоит в задаче.
   */
  async deleteMemberFromTask(
    task: {
      id: number;
      members: { id: number; fullName: string }[];
      boardId: number;
    },
    userId: number,
  ): Promise<{ id: number; fullName: string }> {
    return this.prisma.$transaction(async (tx) => {
      const member = task.members.filter((m) => m.id === userId);
      if (member.length === 0) {
        throw new NotFoundException('User is not a task member');
      }

      await tx.kanbanTask.update({
        where: { id: task.id },
        data: { members: { disconnect: { id: userId } } },
        select: {
          id: true,
        },
      });

      return { id: userId, fullName: member[0].fullName };
    });
  }
}
