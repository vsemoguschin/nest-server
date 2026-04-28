import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UserDto } from '../users/dto/user.dto';

@Injectable()
export class GroupsAccessService {
  private readonly privilegedShortNames = [
    'ADMIN',
    'G',
    'KD',
    'ROV',
    'MOV',
    'MARKETER',
    'LOGIST',
    'DO',
  ];

  buildGroupsScope(user: UserDto): Prisma.GroupWhereInput {
    const scope: Prisma.GroupWhereInput = {
      deletedAt: null,
      id: { gt: 0 },
    };
    if (
      !this.privilegedShortNames.includes(user.role.shortName) ||
      user.groupId === 19 ||
      user.groupId === 17
    ) {
      scope.id = user.groupId;
    }

    if (
      user.groupId === 26 &&
      (user.role.shortName === 'MOV' || user.role.shortName === 'ROV')
    ) {
      scope.id = { in: [17, 19, 26, 28, 29] };
    }

    if (
      (user.groupId === 17 || user.groupId === 19) &&
      user.role.shortName === 'MOP'
    ) {
      scope.id = user.groupId;
    }

    if (user.groupId === 18 || user.groupId === 3) {
      scope.id = { in: [18, 3] };
    }

    if (user.groupId === 3 && user.role.shortName === 'DO') {
      scope.id = { in: [18, 3, 17, 19, 24, 26] };
    }
    if (user.groupId !== 3 && user.role.shortName === 'DO') {
      scope.id = { in: [2, 16, 28, 29, user.groupId] };
    }
    //Ведение неон + руководитель
    if (user.workSpaceId === 4 && user.role.shortName === 'ROV') {
      scope.id = { in: [2, 18, 3, user.groupId] };
    }
    //ведение неон
    if (user.workSpaceId === 4 && user.role.shortName === 'MOV') {
      scope.id = { in: [2, 18, 3, user.groupId] };
    }

    if (user.id === 84 || user.id === 87) {
      scope.id = { in: [2, user.groupId] };
    }

    if (user.id === 88) {
      scope.id = { in: [3, 18, user.groupId] };
    }

    if (user.id === 93) {
      scope.id = { in: [2, 18, 3, user.groupId] };
    }

    if (user.id === 75) {
      scope.id = { in: [2, 18, 3, 4, 17, 19, 26] };
    }

    // console.log(user.id, user.role.shortName, user.groupId, scope);

    return scope;
  }
}
