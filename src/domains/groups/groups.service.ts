import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateWorkspaceGroupDto } from '../workspace-groups/dto/create-workspace-group.dto';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createGroupDto: CreateGroupDto) {
    const workspace = await this.prisma.workSpace.findUnique({
      where: { id: createGroupDto.workSpaceId },
    });
    if (!workspace) {
      throw new NotFoundException(
        `Рабочее пространство с id ${createGroupDto.workSpaceId} не найдено.`,
      );
    }
    // Проверяем уникальность названия группы
    // const existingGroup = await this.prisma.group.findUnique({
    //   where: { title: createGroupDto.title },
    // });
    // if (existingGroup) {
    //   throw new ConflictException(
    //     `Группа с названием "${createGroupDto.title}" уже существует.`,
    //   );
    // }
    return await this.prisma.group.create({
      data: {
        title: createGroupDto.title,
        workSpaceId: createGroupDto.workSpaceId,
      },
    });
  }

  async findAll(user: UserDto) {
    const workspacesSearch =
      user.role.department === 'administration' ||
      user.role.shortName === 'KD' ||
      user.id === 21
        ? { gt: 0 }
        : user.workSpaceId;

    const groupsSearch = ['MOP', 'MOV'].includes(user.role.shortName)
      ? user.groupId
      : { gt: 0 };
    const groups = await this.prisma.group.findMany({
      where: {
        id: groupsSearch,
        workSpaceId: workspacesSearch,
      },
    });
    if (!groups || groups.length === 0) {
      throw new NotFoundException('Группы не найдены.');
    }
    return groups;
  }

  async findOne(id: number) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Группа с id ${id} не найдена.`);
    }
    return group;
  }

  async update(id: number, updateGroupDto: UpdateGroupDto) {
    // Проверка существования группы
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Группа с id ${id} не найдена.`);
    }
    // Если обновляется title, проверим уникальность
    // if (updateGroupDto.title && updateGroupDto.title !== group.title) {
    //   const groupWithSameTitle = await this.prisma.group.findUnique({
    //     where: { title: updateGroupDto.title },
    //   });
    //   if (groupWithSameTitle) {
    //     throw new ConflictException(
    //       `Группа с названием "${updateGroupDto.title}" уже существует.`,
    //     );
    //   }
    // }
    return await this.prisma.group.update({
      where: { id },
      data: { ...updateGroupDto },
    });
  }

  async remove(id: number) {
    // Если требуется физическое удаление. Если нужен soft delete, можно изменить логику.
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException(`Группа с id ${id} не найдена.`);
    }
    return await this.prisma.group.delete({ where: { id } });
  }

  // Метод для получения групп по рабочему пространству
  async findAllByWorkspace(workspaceId: number) {
    const groups = await this.prisma.group.findMany({
      where: { workSpaceId: workspaceId },
    });
    return groups;
  }

  // Метод для создания группы для указанного рабочего пространства
  async createGroupForWorkspace(
    workspaceId: number,
    createDto: CreateWorkspaceGroupDto,
  ) {
    // Проверяем, существует ли группа с таким названием в данном рабочем пространстве
    const existingGroup = await this.prisma.group.findFirst({
      where: { title: createDto.title, workSpaceId: workspaceId },
    });
    if (existingGroup) {
      throw new ConflictException(
        `Группа с названием "${createDto.title}" уже существует в данном рабочем пространстве.`,
      );
    }
    return await this.prisma.group.create({
      data: {
        title: createDto.title,
        workSpaceId: workspaceId,
      },
    });
  }
}
