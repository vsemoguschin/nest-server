import { Injectable, NotFoundException } from '@nestjs/common';
import { UserDto } from '../users/dto/user.dto';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class CommercialDatasService {
  constructor(private readonly prisma: PrismaService) {}

  async getGroups(user: UserDto) {
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
        workSpace: {
          department: 'COMMERCIAL',
        },
      },
    });
    if (!groups || groups.length === 0) {
      throw new NotFoundException('Группы не найдены.');
    }
    return groups;
  }
  async getManagersDatas(user: UserDto, period: string, groupId: number) {
    const managers = await this.prisma.user.findMany({
      where: {
        groupId,
        role: {
          shortName: {
            in: ['DO', 'MOP', 'ROP', 'MOV'],
          },
        },
      },
      include: {
        role: true,
        workSpace: true,
        group: true,
        dealSales: {
          where: {
            deal: {
              saleDate: {
                startsWith: period,
              },
              reservation: false,
              status: { not: 'Возврат' },
            },
          },
        },
        dops: {
          where: {
            saleDate: {
              startsWith: period,
            },
            deal: {
              reservation: false,
              status: { not: 'Возврат' },
            },
          },
        },
        managersPlans: {
          where: {
            period,
          },
        },
        managerReports: {
          where: {
            period,
          },
        },
      },
    });
    const groupAdExpenses = await this.prisma.adExpense.findMany({
      where: {
        date: {
          startsWith: period,
        },
        groupId,
      },
    });
    const adExpenses = groupAdExpenses.reduce((a, b) => a + b.price, 0);
    const totalCalls = managers
      .flatMap((u) => u.managerReports)
      .reduce((a, b) => a + b.calls, 0);
    const callCost = totalCalls ? adExpenses / totalCalls : 0;

    return managers
      .map((m) => {
        const dealSales = m.dealSales.reduce((a, b) => a + b.price, 0);
        const dealsAmount = m.dealSales.length;
        const dopSales = m.dops.reduce((a, b) => a + b.price, 0);
        const totalSales = dealSales + dopSales;
        const averageBill = dealsAmount
          ? +(totalSales / dealsAmount).toFixed()
          : 0;
        const calls = m.managerReports.reduce((a, b) => a + b.calls, 0);
        const drr = totalSales
          ? +(((calls * callCost) / totalSales) * 100).toFixed(2)
          : 0;
        const conversionDealsToCalls = calls
          ? +((dealsAmount / calls) * 100).toFixed(2)
          : 0;
        return {
          fullName: m.fullName,
          role: m.role.fullName,
          id: m.id,
          workSpace: m.workSpace.title,
          group: m.group.title,
          totalSales,
          dealSales,
          dopSales,
          averageBill,
          drr,
          conversionDealsToCalls,
          groupId: m.groupId,
          fired: m.deletedAt ? true : false,
        };
      })
      .filter((u) => u.totalSales || !u.fired);
  }
  async getManagerDatas(user: UserDto, period: string, managerId: number) {
    const m = await this.prisma.user.findUnique({
      where: {
        id: managerId,
      },
      include: {
        role: true,
        workSpace: true,
        group: true,
      },
    });
    //если не найден
    if (!m) {
      throw new NotFoundException('Менеджер не найден');
    }

    return {
      fullName: m.fullName,
      role: m.role.fullName,
      id: m.id,
      workSpace: m.workSpace.title,
      group: m.group.title,
    //   totalSales,
    //   dealSales,
    //   dopSales,
    //   averageBill,
    //   drr,
    //   conversionDealsToCalls,
      groupId: m.groupId,
      fired: m.deletedAt ? true : false,
    };
  }
}
