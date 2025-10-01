// Пример для UsersService
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { UserProfileDto } from 'src/profile/dto/user-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: number): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
      include: { role: true, boards: true }, // Включаем связанную модель Role
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  async create(createUserDto: CreateUserDto) {
    // Допустим, вы также хотите убедиться, что рабочее пространство существует:
    const workspace = await this.prisma.workSpace.findUnique({
      where: { id: createUserDto.workSpaceId },
    });
    if (!workspace) {
      throw new NotFoundException(
        `Рабочее пространство с id ${createUserDto.workSpaceId} не найдено.`,
      );
    }
    const group = await this.prisma.group.findUnique({
      where: { id: createUserDto.groupId },
    });
    if (!group) {
      throw new NotFoundException(
        `Рабочее пространство с id ${createUserDto.groupId} не найдено.`,
      );
    }
    const role = await this.prisma.role.findUnique({
      where: { id: createUserDto.roleId },
    });
    if (!role) {
      throw new NotFoundException(
        `Роли с id ${createUserDto.roleId} не найдено.`,
      );
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(createUserDto.password, 3);

    const createdUser = await this.prisma.user.create({
      data: {
        fullName: createUserDto.fullName,
        email: createUserDto.email,
        password: hashedPassword,
        workSpaceId: createUserDto.workSpaceId,
        groupId: createUserDto.groupId,
        roleId: createUserDto.roleId,
        tg: createUserDto.tg,
      },
    });
    console.log({ ...createdUser, role });
    return { ...createdUser, role };
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      // select: {
      //   id: true,
      //   fullName: true,
      //   email: true,
      // },
    });
    if (!users || users.length === 0) {
      throw new NotFoundException('Пользователи не найдены.');
    }
    return users;
  }

  // Метод для поиска пользователя по email
  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException(`Пользователь с email ${email} не найден.`);
    }
    return user;
  }

  async findById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) {
      throw new NotFoundException(`Пользователь с id ${id} не найден.`);
    }
    return user;
  }

  // DELETE
  async deleteUser(userId: number): Promise<void> {
    // Устанавливаем поле deletedAt текущей датой для мягкого удаления
    await this.prisma.user.update({
      where: { id: userId },
      data: { deletedAt: new Date() },
    });
  }

  // Метод для сравнения пароля (plainPassword с хешированным)
  async comparePasswords(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async updatePassword(
    userId: number,
    newPass: string,
  ): Promise<{ message: string }> {
    // Проверяем, существует ли пользователь
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`Пользователь с ID ${userId} не найден`);
    }

    // Хешируем новый пароль
    const hashedPassword = await bcrypt.hash(newPass, 3);

    // Обновляем пароль в базе данных
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });
    return { message: 'Пароль изменен' };
  }

  async update(id: number, dto: UpdateUserDto) {
    // Проверим, что пользователь существует (и не удалён)
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const data: any = {};

    if (dto.fullName !== undefined) data.fullName = String(dto.fullName).trim();
    if (dto.tg !== undefined) data.tg = String(dto.tg).trim();

    if (dto.tg_id !== undefined) {
      // null -> очистить (ставим 0, т.к. поле не nullable в схеме)
      data.tg_id = dto.tg_id === null ? 0 : dto.tg_id;
    }

    if (dto.roleId !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new NotFoundException(`Role ${dto.roleId} not found`);
      data.roleId = dto.roleId;
    }

    if (Object.keys(data).length === 0) {
      // ничего не меняем — вернём null, чтобы контроллер ответил 204
      return null;
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, fullName: true, email: true, tg: true, tg_id: true, roleId: true },
    });
  }

  async updateAvatar(id: number, avatarUrl: string) {
    return await this.prisma.user.update({
      where: {
        id,
      },
      data: {
        avatarUrl,
      },
    });
  }
}
