import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto) {
    // Проверяем, существует ли уже роль с таким shortName
    const existingRole = await this.prisma.role.findUnique({
      where: { shortName: createRoleDto.shortName },
    });

    if (existingRole) {
      console.log(
        `Роль с shortName "${createRoleDto.shortName}" уже существует.`,
      );
      throw new ConflictException(
        `Роль с shortName "${createRoleDto.shortName}" уже существует.`,
      );
    }

    // Если нет, создаём новую роль
    const role = await this.prisma.role.create({
      data: {
        shortName: createRoleDto.shortName,
        fullName: createRoleDto.fullName,
        department: createRoleDto.department, // если DTO использует enum, убедитесь, что значение корректно
        deletedAt: null,
      },
    });
    return role;
  }
  async findAll() {
    const roles = await this.prisma.role.findMany({
      where: {
        deletedAt: null, // выбираем только активные роли
        shortName: {
          in: ['ROP', 'MOP', 'DIZ', 'MTZ', 'FRZ', 'LAM', 'MASTER', 'PACKER'],
        }, // Фильтруем по списку shortName
      },
    });

    if (!roles || roles.length === 0) {
      throw new NotFoundException('Нет доступных ролей');
    }
    return roles;
  }
  async update(id: number, updateRoleDto: UpdateRoleDto) {
    // Проверяем, существует ли роль с данным id
    const existingRole = await this.prisma.role.findUnique({ where: { id } });
    if (!existingRole) {
      throw new NotFoundException(`Роль с id ${id} не найдена.`);
    }

    // Если обновляется shortName, можно проверить уникальность
    if (
      updateRoleDto.shortName &&
      updateRoleDto.shortName !== existingRole.shortName
    ) {
      const roleWithSameShortName = await this.prisma.role.findUnique({
        where: { shortName: updateRoleDto.shortName },
      });
      if (roleWithSameShortName) {
        throw new ConflictException(
          `Роль с shortName "${updateRoleDto.shortName}" уже существует.`,
        );
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        // Обновляем только переданные поля
        ...updateRoleDto,
      },
    });
  }

  async softDelete(id: number) {
    // Проверяем, существует ли роль с данным id
    const existingRole = await this.prisma.role.findUnique({ where: { id } });
    if (!existingRole) {
      throw new NotFoundException(`Роль с id ${id} не найдена.`);
    }

    // Выполняем мягкое удаление, обновляя поле deletedAt
    return this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
