import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { User } from '@prisma/client';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createWorkspaceDto: CreateWorkspaceDto) {
    // Проверяем, существует ли рабочее пространство с таким названием
    const existingWorkspace = await this.prisma.workSpace.findUnique({
      where: { title: createWorkspaceDto.title },
    });
    if (existingWorkspace) {
      throw new ConflictException(
        `Рабочее пространство с названием "${createWorkspaceDto.title}" уже существует.`,
      );
    }
    return await this.prisma.workSpace.create({
      data: {
        title: createWorkspaceDto.title,
        department: createWorkspaceDto.department,
        deletedAt: null,
      },
    });
  }

  async findOne(id: number) {
    const workspace = await this.prisma.workSpace.findUnique({
      where: { id, deletedAt: null },
      include: {
        groups: {
          include: {
            users: {
              select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException(
        `Рабочее пространство с id ${id} не найдено.`,
      );
    }
    return workspace;
  }

  async findAll(user: UserDto) {
    const workspacesSearch =
      user.role.department === 'administration' ? { gt: 0 } : user.workSpaceId;

    const workspaces = await this.prisma.workSpace.findMany({
      where: {
        deletedAt: null,
        id: workspacesSearch,
      },
    });
    if (!workspaces || workspaces.length === 0) {
      throw new NotFoundException('Нет доступных рабочих пространств');
    }
    return workspaces;
  }

  async update(id: number, updateWorkspaceDto: UpdateWorkspaceDto) {
    // Проверяем, существует ли рабочее пространство
    const workspace = await this.prisma.workSpace.findUnique({ where: { id } });
    if (!workspace) {
      throw new NotFoundException(
        `Рабочее пространство с id ${id} не найдено.`,
      );
    }
    // Если обновляется title, проверяем уникальность
    if (
      updateWorkspaceDto.title &&
      updateWorkspaceDto.title !== workspace.title
    ) {
      const workspaceWithSameTitle = await this.prisma.workSpace.findUnique({
        where: { title: updateWorkspaceDto.title },
      });
      if (workspaceWithSameTitle) {
        throw new ConflictException(
          `Рабочее пространство с названием "${updateWorkspaceDto.title}" уже существует.`,
        );
      }
    }
    return await this.prisma.workSpace.update({
      where: { id },
      data: {
        ...updateWorkspaceDto,
      },
    });
  }

  async softDelete(id: number) {
    const workspace = await this.prisma.workSpace.findUnique({ where: { id } });
    if (!workspace) {
      throw new NotFoundException(
        `Рабочее пространство с id ${id} не найдено.`,
      );
    }
    return await this.prisma.workSpace.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
