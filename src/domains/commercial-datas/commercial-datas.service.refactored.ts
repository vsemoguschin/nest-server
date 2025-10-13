// import { Injectable, NotFoundException } from '@nestjs/common';
// import { UserDto } from '../users/dto/user.dto';
// import { PrismaService } from 'src/prisma/prisma.service';

// const DEAL_STATUS_FILTER = {
//   reservation: false,
//   status: { not: 'Возврат' as const },
// };

// const buildDealPeriodFilter = (period: string) => ({
//   saleDate: {
//     startsWith: period,
//   },
//   ...DEAL_STATUS_FILTER,
// });

// const buildDealRelationPeriodFilter = (period: string) => ({
//   deal: buildDealPeriodFilter(period),
// });

// const buildDopPeriodFilter = (period: string) => ({
//   saleDate: {
//     startsWith: period,
//   },
//   deal: DEAL_STATUS_FILTER,
// });

// const buildPaymentPeriodFilter = (period: string) => ({
//   date: {
//     startsWith: period,
//   },
// });

// interface DealsInfo {
//   dealPrice: number;
//   dealerPart: number;
//   dealerPrice: number;
//   id: number;
//   paid: number;
//   saleDate: string;
//   title: string;
//   usersId: number;
//   bonusPercentage: number;
//   toSalary: number;
// }

// interface DopsInfo {
//   title: string;
//   dopPrice: number;
//   saleDate: string;
//   dealTitle: string;
//   dealId: number;
//   paid: number;
//   userId: number;
//   bonusPercentage: number;
//   toSalary: number;
// }

// interface BonusThreshold {
//   limit: number;
//   percentage: number;
//   bonus?: number;
// }

// interface GroupUserMetrics {
//   id: number;
//   fullName: string;
//   groupId: number;
//   workSpaceId: number;
//   totalSales: number;
//   shift: number;
//   topBonus: number;
//   dopSales: number;
//   dimmerSales: number;
//   dealsSalesWithoutDesigners: number;
//   conversionDayToDay: number;
//   dealSales: number;
//   averageBill: number;
//   conversion: number;
// }

// type GroupUserWithRelations = {
//   id: number;
//   fullName: string;
//   groupId: number;
//   workSpaceId: number;
//   managerReports: Array<{ calls: number }>;
//   dealSales: Array<{
//     price: number;
//     deal: {
//       saleDate: string;
//       client: { firstContact: string };
//       maketType: string;
//       price: number;
//     };
//   }>;
//   dops: Array<{
//     price: number;
//     type: string;
//     saleDate: string;
//   }>;
// };

// type NumericMetricKey = {
//   [K in keyof GroupUserMetrics]: GroupUserMetrics[K] extends number ? K : never;
// }[keyof GroupUserMetrics];

// interface VkTopItem {
//   user: string;
//   sales: number;
// }

// interface B2BTopItem {
//   user: string;
//   sales: number;
//   category: string;
// }

// const WORKSPACE2_REGULAR_THRESHOLDS: BonusThreshold[] = [
//   { limit: 400_000, percentage: 0.03 },
//   { limit: 560_000, percentage: 0.03 },
//   { limit: 680_000, percentage: 0.035 },
//   { limit: 800_000, percentage: 0.04 },
//   { limit: 1_000_000, percentage: 0.045, bonus: 10_480 },
//   { limit: 1_100_000, percentage: 0.05, bonus: 15_000 },
//   { limit: 1_200_000, percentage: 0.05, bonus: 17_500 },
//   { limit: 1_350_000, percentage: 0.05, bonus: 20_000 },
//   { limit: 1_500_000, percentage: 0.05, bonus: 23_700 },
//   { limit: 1_700_000, percentage: 0.05, bonus: 27_500 },
//   { limit: 2_000_000, percentage: 0.05, bonus: 32_500 },
//   { limit: Infinity, percentage: 0.05, bonus: 40_000 },
// ];

// const WORKSPACE2_INTERN_THRESHOLDS: BonusThreshold[] = [
//   { limit: 800_000, percentage: 0.04 },
//   { limit: 1_000_000, percentage: 0.045, bonus: 10_480 },
//   { limit: 1_100_000, percentage: 0.05, bonus: 15_000 },
//   { limit: 1_200_000, percentage: 0.05, bonus: 17_500 },
//   { limit: 1_350_000, percentage: 0.05, bonus: 20_000 },
//   { limit: 1_500_000, percentage: 0.05, bonus: 23_700 },
//   { limit: 1_700_000, percentage: 0.05, bonus: 27_500 },
//   { limit: 2_000_000, percentage: 0.05, bonus: 32_500 },
//   { limit: Infinity, percentage: 0.05, bonus: 40_000 },
// ];

// const WORKSPACE3_REGULAR_THRESHOLDS: BonusThreshold[] = [
//   { limit: 400_000, percentage: 0.03 },
//   { limit: 600_000, percentage: 0.05 },
//   { limit: 700_000, percentage: 0.06 },
//   { limit: 1_000_000, percentage: 0.07 },
//   { limit: Infinity, percentage: 0.07, bonus: 10_000 },
// ];

// const WORKSPACE3_INTERN_THRESHOLDS: BonusThreshold[] = [
//   { limit: 250_000, percentage: 0.03 },
//   { limit: 450_000, percentage: 0.05 },
//   { limit: 550_000, percentage: 0.06 },
//   { limit: 850_000, percentage: 0.07 },
//   { limit: Infinity, percentage: 0.07, bonus: 10_000 },
// ];

// @Injectable()
// export class CommercialDatasService {
//   constructor(private readonly prisma: PrismaService) {}
//   private getDaysInMonth(year: number, month: number): number {
//     return new Date(year, month, 0).getDate();
//   }
//   private calculateTemp(totalSales: number, period: string): number {
//     const [yearStr, monthStr] = period.split('-');
//     if (!yearStr || !monthStr) {
//       return 0;
//     }

//     const year = Number.parseInt(yearStr, 10);
//     const month = Number.parseInt(monthStr, 10);
//     if (Number.isNaN(year) || Number.isNaN(month)) {
//       return 0;
//     }
//     const daysInMonth = this.getDaysInMonth(year, month);

//     const currentIso = new Date().toISOString();
//     const isCurrentMonth = monthStr === currentIso.slice(5, 7);
//     const dayValue = isCurrentMonth
//       ? Number.parseInt(currentIso.slice(8, 10), 10)
//       : daysInMonth;

//     if (!dayValue) {
//       return 0;
//     }

//     return Math.round((totalSales / dayValue) * daysInMonth);
//   }

//   private async getManagerGroupDatas(groupId: number, period: string) {
//     const group = await this.prisma.group.findFirst({
//       where: {
//         id: groupId,
//         users: {
//           some: {},
//         },
//       },
//       include: {
//         adExpenses: {
//           where: buildPaymentPeriodFilter(period),
//         },
//         users: {
//           include: {
//             managerReports: {
//               where: buildPaymentPeriodFilter(period),
//             },
//             dealSales: {
//               where: buildDealRelationPeriodFilter(period),
//               include: {
//                 deal: {
//                   include: {
//                     client: true,
//                   },
//                 },
//               },
//             },
//             dops: {
//               where: buildDopPeriodFilter(period),
//             },
//           },
//         },
//         deals: {
//           where: buildDealPeriodFilter(period),
//         },
//         dops: {
//           where: buildDopPeriodFilter(period),
//         },
//       },
//     });

//     if (!group) {
//       throw new NotFoundException('Группа не найдена');
//     }

//     const adExpenses = group.adExpenses.reduce((acc, expense) => acc + expense.price, 0);
//     const totalCalls = group.users
//       .flatMap((user) => user.managerReports)
//       .reduce((acc, report) => acc + report.calls, 0);
//     const callCost = totalCalls ? adExpenses / totalCalls : 0;

//     const ropPlan = await this.prisma.managersPlan.findMany({
//       where: {
//         period,
//         user: {
//           role: {
//             shortName: 'DO',
//           },
//           fullName: { in: ['Юлия Куштанова', 'Сергей Иванов'] },
//         },
//       },
//       include: {
//         user: true,
//       },
//     });

//     const ropPlanValue =
//       ropPlan.find((plan) => plan.user.workSpaceId === group.workSpaceId)?.plan || 0;
//     const groupDealSales = group.deals.reduce((acc, deal) => acc + deal.price, 0);
//     const groupDopSales = group.dops.reduce((acc, dop) => acc + dop.price, 0);
//     const groupTotalSales = groupDealSales + groupDopSales;
//     const isOverRopPlan = ropPlanValue > 0 && groupTotalSales > ropPlanValue;

//     const userData = this.mapGroupUsersToMetrics(group.users);
//     this.applyGroupTopBonuses(userData);

//     return {
//       adExpenses,
//       totalCalls,
//       callCost,
//       isOverRopPlan,
//       tops: userData.filter((user) => user.topBonus > 0),
//     };
//   }

//   private mapGroupUsersToMetrics(
//     users: GroupUserWithRelations[],
//   ): GroupUserMetrics[] {
//     return users.map((user) => {
//       const dealSales = user.dealSales.reduce((acc, deal) => acc + deal.price, 0);
//       const dopSales = user.dops.reduce((acc, dop) => acc + dop.price, 0);
//       const totalSales = dealSales + dopSales;
//       const shift = user.managerReports.length;
//       const dealsAmount = user.dealSales.length;
//       const averageBill = dealsAmount ? Math.round(totalSales / dealsAmount) : 0;
//       const dimmerSales = user.dops
//         .filter((dop) => dop.type === 'Диммер')
//         .reduce((acc, dop) => acc + dop.price, 0);
//       const dealsWithoutDesigners = user.dealSales
//         .flatMap((sale) => sale.deal)
//         .filter((deal) =>
//           [
//             'Заготовка из базы',
//             'Рекламный',
//             'Из рассылки',
//             'Визуализатор',
//           ].includes(deal.maketType),
//         );
//       const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
//         (sum, deal) => sum + (deal.price || 0),
//         0,
//       );
//       const dealsDayToDay = user.dealSales.filter(
//         (sale) => sale.deal.saleDate === sale.deal.client.firstContact,
//       );
//       const calls = user.managerReports.reduce((acc, report) => acc + report.calls, 0);
//       const conversionDayToDay = calls
//         ? Number(((dealsDayToDay.length / calls) * 100).toFixed(2))
//         : 0;
//       const conversion = calls
//         ? Number(((dealsAmount / calls) * 100).toFixed(2))
//         : 0;

//       return {
//         id: user.id,
//         fullName: user.fullName,
//         groupId: user.groupId,
//         workSpaceId: user.workSpaceId,
//         totalSales,
//         shift,
//         topBonus: 0,
//         dopSales,
//         dimmerSales,
//         dealsSalesWithoutDesigners,
//         conversionDayToDay,
//         dealSales,
//         averageBill,
//         conversion,
//       };
//     });
//   }

//   private applyGroupTopBonuses(userData: GroupUserMetrics[]): void {
//     const vkConfigs: Array<{
//       sortBy: NumericMetricKey;
//       valueSelector: (user: GroupUserMetrics) => number;
//     }> = [
//       {
//         sortBy: 'totalSales',
//         valueSelector: (user) => user.totalSales,
//       },
//       {
//         sortBy: 'dopSales',
//         valueSelector: (user) => user.dopSales,
//       },
//       {
//         sortBy: 'dimmerSales',
//         valueSelector: (user) => user.dimmerSales,
//       },
//       {
//         sortBy: 'dealsSalesWithoutDesigners',
//         valueSelector: (user) => user.dealsSalesWithoutDesigners,
//       },
//       {
//         sortBy: 'conversionDayToDay',
//         valueSelector: (user) => user.conversionDayToDay,
//       },
//     ];

//     vkConfigs.forEach((config) => {
//       this.collectTop<VkTopItem>(userData, {
//         filter: (user) => user.workSpaceId === 3 && user.groupId !== 19,
//         sortBy: config.sortBy,
//         take: 3,
//         bonusCalculator: (user, index) =>
//           user.shift > 12 ? (3 - index) * 1000 : 0,
//         shouldInclude: (user) => user.totalSales !== 0,
//         toResult: (user) => ({
//           user: user.fullName,
//           sales: config.valueSelector(user),
//         }),
//       });
//     });

//     const b2bConfigs: Array<{
//       category: string;
//       sortBy: NumericMetricKey;
//       valueSelector: (user: GroupUserMetrics) => number;
//     }> = [
//       {
//         category: 'Топ суммы заказов',
//         sortBy: 'dealSales',
//         valueSelector: (user) => user.dealSales,
//       },
//       {
//         category: 'Топ сумма допов',
//         sortBy: 'dopSales',
//         valueSelector: (user) => user.dopSales,
//       },
//       {
//         category: 'Топ средний чек',
//         sortBy: 'averageBill',
//         valueSelector: (user) => user.averageBill,
//       },
//       {
//         category: 'Топ конверсия',
//         sortBy: 'conversion',
//         valueSelector: (user) => user.conversion,
//       },
//     ];

//     b2bConfigs.forEach((config) => {
//       this.collectTop<B2BTopItem>(userData, {
//         filter: (user) => user.workSpaceId === 2,
//         sortBy: config.sortBy,
//         take: 1,
//         bonusCalculator: (user) => (user.shift > 12 ? 2000 : 0),
//         shouldInclude: (user) => user.totalSales !== 0,
//         toResult: (user) => ({
//           user: user.fullName,
//           sales: config.valueSelector(user),
//           category: config.category,
//         }),
//       });
//     });
//   }

//   private collectTop<T>(
//     data: GroupUserMetrics[],
//     {
//       filter,
//       sortBy,
//       take,
//       bonusCalculator,
//       toResult,
//       shouldInclude = () => true,
//     }: {
//       filter: (user: GroupUserMetrics) => boolean;
//       sortBy: NumericMetricKey;
//       take: number;
//       bonusCalculator: (user: GroupUserMetrics, index: number) => number;
//       toResult: (user: GroupUserMetrics) => T;
//       shouldInclude?: (user: GroupUserMetrics) => boolean;
//     },
//   ): T[] {
//     return data
//       .filter(filter)
//       .sort(
//         (a, b) =>
//           Number((b as Record<string, number>)[sortBy as string] ?? 0) -
//           Number((a as Record<string, number>)[sortBy as string] ?? 0),
//       )
//       .slice(0, take)
//       .reduce<T[]>((acc, user, index) => {
//         if (!shouldInclude(user)) {
//           return acc;
//         }
//         const bonus = bonusCalculator(user, index);
//         if (bonus > 0) {
//           user.topBonus += bonus;
//         }
//         acc.push(toResult(user));
//         return acc;
//       }, []);
//   }

//   private calculateManagerBaseMetrics(
//     manager: {
//       dealSales: Array<{ price: number }>;
//       dops: Array<{ price: number }>;
//       managerReports: Array<{ calls: number }>;
//     },
//     callCost: number,
//   ) {
//     const dealSales = manager.dealSales.reduce((acc, sale) => acc + sale.price, 0);
//     const dealsAmount = manager.dealSales.length;
//     const dopSales = manager.dops.reduce((acc, dop) => acc + dop.price, 0);
//     const totalSales = dealSales + dopSales;
//     const calls = manager.managerReports.reduce((acc, report) => acc + report.calls, 0);
//     const averageBill = dealsAmount ? Math.round(totalSales / dealsAmount) : 0;
//     const drr = totalSales
//       ? Number((((calls * callCost) / totalSales) * 100).toFixed(2))
//       : 0;
//     const conversionDealsToCalls = calls
//       ? Number(((dealsAmount / calls) * 100).toFixed(2))
//       : 0;

//     return {
//       dealSales,
//       dealsAmount,
//       dopSales,
//       totalSales,
//       calls,
//       averageBill,
//       drr,
//       conversionDealsToCalls,
//     };
//   }

//   private getBonusPercentage(
//     totalSales: number,
//     workSpaceId: number,
//     groupId: number,
//     isIntern: boolean,
//     role: string,
//     period: string,
//   ) {
//     let bonusPercentage = 0;
//     let dopsPercentage = 0;
//     let bonus = 0;

//     if (workSpaceId === 2) {
//       const thresholds = isIntern
//         ? WORKSPACE2_INTERN_THRESHOLDS
//         : WORKSPACE2_REGULAR_THRESHOLDS;
//       const threshold = this.resolveBonusThreshold(totalSales, thresholds);

//       if (threshold) {
//         bonusPercentage = threshold.percentage;
//         bonus += threshold.bonus ?? 0;
//       }

//       if (isIntern && totalSales > 600_000) {
//         bonus += 2_000;
//       }

//       dopsPercentage = 0.1;
//     } else if (workSpaceId === 3) {
//       const thresholds = isIntern
//         ? WORKSPACE3_INTERN_THRESHOLDS
//         : WORKSPACE3_REGULAR_THRESHOLDS;
//       const threshold = this.resolveBonusThreshold(totalSales, thresholds);

//       if (threshold) {
//         bonusPercentage = threshold.percentage;
//         bonus += threshold.bonus ?? 0;
//       }

//       dopsPercentage = bonusPercentage;
//     }

//     if (groupId === 19) {
//       bonusPercentage = 0.07;
//     }
//     if (groupId === 19 && role === 'MOV' && period >= '2025-10') {
//       bonusPercentage = 0;
//     }

//     return {
//       bonusPercentage,
//       dopsPercentage,
//       bonus,
//     };
//   }

//   private resolveBonusThreshold(
//     totalSales: number,
//     thresholds: BonusThreshold[],
//   ): BonusThreshold | undefined {
//     return thresholds.find((threshold) => totalSales < threshold.limit);
//   }

//   private async getManagerSalesDatas(userId: number, period: string) {
//     const payments = await this.prisma.payment.findMany({
//       where: {
//         ...buildPaymentPeriodFilter(period),
//         deal: {
//           ...DEAL_STATUS_FILTER,
//           OR: [
//             {
//               dealers: {
//                 some: {
//                   userId,
//                 },
//               },
//             },
//             {
//               dops: {
//                 some: {
//                   userId,
//                 },
//               },
//             },
//           ],
//         },
//       },
//       include: {
//         deal: {
//           include: {
//             dops: true,
//             payments: true,
//             dealers: true,
//           },
//         },
//       },
//     });

//     const bonusPeriodsSet = new Set<string>();
//     bonusPeriodsSet.add(period);
//     payments.forEach((payment) => {
//       const saleDate = payment.deal.saleDate;
//       if (saleDate) {
//         bonusPeriodsSet.add(saleDate.slice(0, 7));
//       }
//     });
//     const bonusPeriods = Array.from(bonusPeriodsSet).sort();

//     const manager = await this.prisma.user.findUnique({
//       where: {
//         id: userId,
//       },
//       include: {
//         role: true,
//         dealSales: {
//           where: {
//             deal: {
//               ...DEAL_STATUS_FILTER,
//               OR: bonusPeriods.map((per) => ({
//                 saleDate: { startsWith: per },
//               })),
//             },
//           },
//           include: {
//             deal: {
//               include: {
//                 client: true,
//                 payments: true,
//               },
//             },
//           },
//         },
//         dops: {
//           where: {
//             OR: bonusPeriods.map((per) => ({
//               saleDate: { startsWith: per },
//             })),
//             deal: DEAL_STATUS_FILTER,
//           },
//           include: {
//             deal: {
//               select: {
//                 title: true,
//                 price: true,
//                 payments: true,
//                 dops: true,
//               },
//             },
//           },
//         },
//         managerReports: {
//           where: {
//             period,
//           },
//         },
//       },
//     });

//     if (!manager) {
//       throw new NotFoundException('Менеджер не найден.');
//     }

//     const isIntern = manager.managerReports.some((report) => report.isIntern);
//     const periodBonusMap = new Map<string, ReturnType<CommercialDatasService['getBonusPercentage']>>();

//     bonusPeriods.forEach((per) => {
//       const dealSalesTotal = manager.dealSales
//         .filter((sale) => sale.deal.saleDate.startsWith(per))
//         .reduce((acc, sale) => acc + sale.price, 0);
//       const dopSalesTotal = manager.dops
//         .filter((dop) => dop.saleDate.startsWith(per))
//         .reduce((acc, dop) => acc + dop.price, 0);
//       const totalSales = dealSalesTotal + dopSalesTotal;

//       periodBonusMap.set(
//         per,
//         this.getBonusPercentage(
//           totalSales,
//           manager.workSpaceId,
//           manager.groupId,
//           isIntern,
//           manager.role.shortName,
//           per,
//         ),
//       );
//     });

//     const dealsInfo: DealsInfo[] = [];
//     const dealsInfoPrevMounth: DealsInfo[] = [];
//     const dopsInfo: DopsInfo[] = [];
//     const dopsInfoPrevMounth: DopsInfo[] = [];
//     const checkedDeals: number[] = [];

//     payments.forEach((payment) => {
//       if (checkedDeals.includes(payment.deal.id)) {
//         return;
//       }
//       checkedDeals.push(payment.deal.id);

//       const payPeriod = payment.date.slice(0, 7);
//       const deal = payment.deal;
//       const dealPrice = deal.price;
//       const dealers = deal.dealers;
//       const dops = deal.dops;

//       const dealPaymentsLastPeriod = deal.payments
//         .filter((p) => p.date.slice(0, 7) < payPeriod)
//         .reduce((acc, item) => acc + item.price, 0);
//       const dealPaymentsThisPeriod = deal.payments
//         .filter((p) => p.date.slice(0, 7) === payPeriod)
//         .reduce((acc, item) => acc + item.price, 0);

//       let dealPaid = 0;
//       let dopPaid = 0;

//       if (dealPrice < dealPaymentsLastPeriod + dealPaymentsThisPeriod) {
//         dopPaid = dealPaymentsLastPeriod + dealPaymentsThisPeriod - dealPrice;
//         if (dealPrice < dealPaymentsLastPeriod) {
//           dopPaid = dealPaymentsThisPeriod;
//         }
//         dealPaid =
//           dealPrice - dealPaymentsLastPeriod < 0
//             ? 0
//             : dealPrice - dealPaymentsLastPeriod;
//       }

//       if (dealPrice >= dealPaymentsLastPeriod + dealPaymentsThisPeriod) {
//         dealPaid = dealPaymentsThisPeriod;
//         dopPaid = 0;
//       }

//       const dealer = dealers.find((d) => d.userId === userId);
//       if (dealer) {
//         const dealerPrice = dealer.price;
//         const dealerPart = dealerPrice / dealPrice;
//         const paid = Number((dealPaid * dealerPart).toFixed(2));
//         const salePeriod = deal.saleDate.slice(0, 7);
//         const bonusPercentage =
//           periodBonusMap.get(salePeriod)?.bonusPercentage ?? 0;
//         const item = {
//           id: deal.id,
//           title: deal.title,
//           saleDate: deal.saleDate,
//           dealPrice,
//           dealerPrice,
//           dealerPart: Number((dealerPart * 100).toFixed()),
//           paid,
//           usersId: dealer.userId,
//           bonusPercentage,
//           toSalary: paid * bonusPercentage,
//         };
//         if (salePeriod === period) {
//           dealsInfo.push(item);
//         } else {
//           dealsInfoPrevMounth.push(item);
//         }
//       }

//       const managerDops = dops.filter((dop) => dop.userId === userId);
//       if (managerDops.length) {
//         const dealDopsPrice = dops.reduce((acc, dop) => acc + dop.price, 0);
//         managerDops.forEach((dop) => {
//           const dealerPart = dop.price / dealDopsPrice;
//           const paid = Number((dopPaid * dealerPart).toFixed(2));
//           const salePeriod = dop.saleDate.slice(0, 7);
//           const bonusPercentage =
//             periodBonusMap.get(salePeriod)?.dopsPercentage ?? 0;
//           const item = {
//             title: dop.type,
//             dopPrice: dop.price,
//             saleDate: dop.saleDate,
//             dealTitle: deal.title,
//             dealId: deal.id,
//             paid,
//             userId: dop.userId,
//             bonusPercentage,
//             toSalary: paid * bonusPercentage,
//           };
//           if (salePeriod === period) {
//             dopsInfo.push(item);
//           } else {
//             dopsInfoPrevMounth.push(item);
//           }
//         });
//       }
//     });

//     return {
//       dealsInfo,
//       dealsInfoPrevMounth,
//       dopsInfo,
//       dopsInfoPrevMounth,
//     };
//   }

//   private async getManagerSalaryDatas(userId: number, period: string) {
//     const m = await this.prisma.user.findUnique({
//       where: {
//         id: userId,
//       },
//       include: {
//         managersPlans: {
//           where: {
//             period,
//           },
//         },
//         managerReports: {
//           where: {
//             period,
//           },
//         },
//         salaryPays: {
//           where: {
//             period,
//           },
//         },
//         salaryCorrections: {
//           where: {
//             period,
//           },
//         },
//       },
//     });
//     if (!m) {
//       throw new NotFoundException('Менеджер не найден.');
//     }
//     const pays = m.salaryPays.reduce((a, b) => a + b.price, 0) || 0;
//     const salaryCorrections = m.salaryCorrections;
//     const shift = m.managerReports.length;
//     const shiftBonus = m.managerReports.reduce((a, b) => a + b.shiftCost, 0);
//     return {
//       pays,
//       salaryPays: m.salaryPays,
//       salaryCorrections,
//       shiftBonus,
//       shift,
//     };
//   }
//   /** get /commercial-datas/groups */
//   async getGroups(user: UserDto) {
//     const workspacesSearch =
//       user.role.department === 'administration' ||
//       user.role.shortName === 'KD' ||
//       user.id === 21
//         ? { gt: 0 }
//         : user.workSpaceId;

//     const groupsSearch = ['MOP', 'MOV'].includes(user.role.shortName)
//       ? user.groupId
//       : { gt: 0 };
//     const groups = await this.prisma.group.findMany({
//       where: {
//         id: groupsSearch,
//         workSpaceId: workspacesSearch,
//         workSpace: {
//           department: 'COMMERCIAL',
//         },
//       },
//     });
//     if (!groups || groups.length === 0) {
//       throw new NotFoundException('Группы не найдены.');
//     }
//     return groups;
//   }
//   /** get /commercial-datas */
//   async getManagersDatas(user: UserDto, period: string, groupId: number) {
//     const managers = await this.prisma.user.findMany({
//       where: {
//         groupId,
//         role: {
//           shortName: {
//             in: ['DO', 'MOP', 'ROP', 'MOV'],
//           },
//         },
//       },
//       include: {
//         role: true,
//         workSpace: true,
//         group: true,
//         dealSales: {
//           where: {
//             deal: {
//               saleDate: {
//                 startsWith: period,
//               },
//               reservation: false,
//               status: { not: 'Возврат' },
//             },
//           },
//         },
//         dops: {
//           where: {
//             saleDate: {
//               startsWith: period,
//             },
//             deal: {
//               reservation: false,
//               status: { not: 'Возврат' },
//             },
//           },
//         },
//         managersPlans: {
//           where: {
//             period,
//           },
//         },
//         managerReports: {
//           where: {
//             period,
//           },
//         },
//         payments: {
//           where: {
//             date: {
//               startsWith: period,
//             },
//           },
//         },
//       },
//     });
//     const groupAdExpenses = await this.prisma.adExpense.findMany({
//       where: {
//         date: {
//           startsWith: period,
//         },
//         groupId,
//       },
//     });
//     const adExpenses = groupAdExpenses.reduce((a, b) => a + b.price, 0);
//     const totalCalls = managers
//       .flatMap((u) => u.managerReports)
//       .reduce((a, b) => a + b.calls, 0);
//     const callCost = totalCalls ? adExpenses / totalCalls : 0;

//     return managers
//       .map((m) => {
//         const {
//           dealSales,
//           dopSales,
//           totalSales,
//           averageBill,
//           drr,
//           conversionDealsToCalls,
//         } = this.calculateManagerBaseMetrics(m, callCost);
//         return {
//           fullName: m.fullName,
//           role: m.role.fullName,
//           id: m.id,
//           workSpace: m.workSpace.title,
//           group: m.group.title,
//           totalSales,
//           dealSales,
//           dopSales,
//           averageBill,
//           drr,
//           conversionDealsToCalls,
//           groupId: m.groupId,
//           fired: m.deletedAt ? true : false,
//           fact:
//             m.role.shortName === 'MOV'
//               ? m.payments.reduce((a, b) => a + b.price, 0)
//               : 0,
//         };
//       })
//       .sort((a, b) => b.totalSales - a.totalSales);
//     //   .filter((u) => u.totalSales || !u.fired);
//   }
//   /** get /commercial-datas/:managerId */
//   async getManagerDatas(user: UserDto, period: string, managerId: number) {
//     const m = await this.prisma.user.findUnique({
//       where: {
//         id: managerId,
//       },
//       include: {
//         role: true,
//         workSpace: true,
//         group: true,
//         managersPlans: {
//           where: {
//             period,
//           },
//         },
//         dealSales: {
//           where: {
//             deal: {
//               saleDate: {
//                 startsWith: period,
//               },
//               reservation: false,
//               status: { not: 'Возврат' },
//             },
//           },
//           include: {
//             deal: {
//               include: {
//                 client: true,
//                 payments: true,
//               },
//             },
//           },
//         },
//         dops: {
//           where: {
//             saleDate: {
//               startsWith: period,
//             },
//             deal: {
//               reservation: false,
//               status: { not: 'Возврат' },
//             },
//           },
//           include: {
//             deal: {
//               select: {
//                 title: true,
//                 price: true,
//                 payments: true,
//                 dops: true,
//               },
//             },
//           },
//         },
//         managerReports: {
//           where: {
//             period,
//           },
//         },
//         payments: {
//           where: {
//             date: {
//               startsWith: period,
//             },
//           },
//         },
//         salaryPays: {
//           where: {
//             period,
//           },
//         },
//         salaryCorrections: {
//           where: {
//             period,
//           },
//         },
//       },
//     });

//     if (!m) {
//       throw new NotFoundException('Менеджер не найден.');
//     }
//     const { callCost, isOverRopPlan, tops } = await this.getManagerGroupDatas(
//       m.groupId,
//       period,
//     );
//     const {
//       dealSales,
//       dealsAmount,
//       dopSales,
//       totalSales,
//       calls,
//       averageBill,
//       drr,
//       conversionDealsToCalls,
//     } = this.calculateManagerBaseMetrics(m, callCost);
//     const dopsAmount = m.dops.length;
//     /**Факт для ведения */
//     const fact =
//       m.groupId === 19 && m.role.shortName === 'MOV'
//         ? m.payments.reduce((a, b) => a + b.price, 0)
//         : 0;
//     const factAmount = m.payments.length;
//     const factPercentage =
//       m.groupId === 19 && m.role.shortName === 'MOV' ? 0.1 : 0;
//     const factBonus = +(fact * factPercentage).toFixed(2);
//     const temp = this.calculateTemp(totalSales, period);

//     /** количество заявок менеджера */
//     /** макеты */
//     const makets = m.managerReports.reduce((a, b) => a + b.makets, 0);
//     /** Макеты день в день */
//     const maketsDayToDay = m.managerReports.reduce(
//       (a, b) => a + b.maketsDayToDay,
//       0,
//     );
//     /**Переходы в мессенджер */
//     const redirectToMSG = m.managerReports.reduce(
//       (a, b) => a + b.redirectToMSG,
//       0,
//     );
//     /** % из заявки в макет */
//     const conversionMaketsToCalls = calls
//       ? +((makets / calls) * 100).toFixed(2)
//       : 0;

//     /** % из макета в продажу */
//     const conversionMaketsToSales = makets
//       ? +((dealsAmount / makets) * 100).toFixed(2)
//       : 0;
//     /** % из заявки в макет день в день */
//     const conversionMaketsDayToDayToCalls = calls
//       ? +((maketsDayToDay / calls) * 100).toFixed(2)
//       : 0;
//     /** Продажи день в день */
//     const dealsDayToDay = m.dealSales
//       .flatMap((ds) => ds.deal)
//       .filter((d) => d.saleDate === d.client.firstContact);
//     /** Продажи день в день */
//     const dealsDayToDayPrice = dealsDayToDay.reduce((a, b) => a + b.price, 0);
//     /** Без дизайнера */
//     const dealsWithoutDesigners = m.dealSales
//       .flatMap((ds) => ds.deal)
//       .filter((d) =>
//         [
//           'Заготовка из базы',
//           'Рекламный',
//           'Из рассылки',
//           'Визуализатор',
//         ].includes(d.maketType),
//       );
//     /** Сумма продаж без дизайнера */
//     const dealsSalesWithoutDesigners = dealsWithoutDesigners.reduce(
//       (sum, deal) => sum + (deal.price || 0),
//       0,
//     );

//     const { dealsInfo, dealsInfoPrevMounth, dopsInfo, dopsInfoPrevMounth } =
//       await this.getManagerSalesDatas(m.id, period);
//     const dealPays = +dealsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
//     const dopPays = +dopsInfo.reduce((a, b) => a + b.toSalary, 0).toFixed(2);
//     const prevPeriodsDealsPays = +dealsInfoPrevMounth
//       .reduce((a, b) => a + b.toSalary, 0)
//       .toFixed(2);
//     const prevPeriodsDopsPays = +dopsInfoPrevMounth
//       .reduce((a, b) => a + b.toSalary, 0)
//       .toFixed(2);
//     const { pays, salaryPays, salaryCorrections, shift, shiftBonus } =
//       await this.getManagerSalaryDatas(m.id, period);
//     const isIntern = m.managerReports.find((r) => r.isIntern === true)
//       ? true
//       : false;
//     const { bonusPercentage, bonus, dopsPercentage } = this.getBonusPercentage(
//       totalSales,
//       m.workSpaceId,
//       m.groupId,
//       isIntern,
//       m.role.shortName,
//       period,
//     );
//     let totalSalary = 0;

//     const salaryCorrectionMinus = salaryCorrections
//       .filter((c) => c.type === 'Вычет')
//       .reduce((a, b) => a + b.price, 0);
//     const salaryCorrectionPlus = salaryCorrections
//       .filter((s) => s.type === 'Прибавка')
//       .reduce((a, b) => a + b.price, 0);
//     const groupPlanBonus =
//       isOverRopPlan &&
//       m.deletedAt === null &&
//       (m.groupId === 3 || m.groupId === 2)
//         ? 3000
//         : 0;
//     const topBonus = tops.find((m) => m.id === managerId)?.topBonus ?? 0;
//     totalSalary +=
//       salaryCorrectionPlus -
//       salaryCorrectionMinus +
//       prevPeriodsDealsPays +
//       prevPeriodsDopsPays +
//       bonus +
//       dealPays +
//       dopPays +
//       shiftBonus +
//       groupPlanBonus +
//       topBonus +
//       factBonus;

//     return {
//       fullName: m.fullName,
//       role: m.role.fullName,
//       id: m.id,
//       workSpace: m.workSpace.title,
//       group: m.group.title,

//       plan: m.managersPlans[0]?.plan ?? 0,
//       totalSales,
//       dealsAmount,
//       dealSales,
//       dopsAmount,
//       dopSales,
//       fact,
//       factAmount,
//       factPercentage,
//       factBonus,
//       temp,

//       // Показатели
//       averageBill,
//       drr,
//       calls,
//       conversionDealsToCalls,
//       conversionMaketsToCalls,
//       makets,
//       conversionMaketsToSales,
//       maketsDayToDay,
//       conversionMaketsDayToDayToCalls,
//       dealsDayToDay: dealsDayToDay.length,
//       dealsDayToDayPrice,
//       dealsWithoutDesigners: dealsWithoutDesigners.length,
//       dealsSalesWithoutDesigners,
//       redirectToMSG,

//       pays,
//       salaryPays,
//       salaryCorrections,
//       shift,
//       shiftBonus,

//       bonusPercentage,
//       bonus,
//       dopsPercentage,

//       dopPays,
//       dealPays,
//       topBonus,
//       totalSalary,
//       rem: 0,

//       dealsInfo: dealsInfo
//         .sort((a, b) => a.id - b.id)
//         .filter((d) => d.toSalary > 0),
//       dealsInfoPrevMounth: dealsInfoPrevMounth
//         .sort((a, b) => a.id - b.id)
//         .filter((d) => d.toSalary > 0),
//       dopsInfo: dopsInfo
//         .sort((a, b) => a.dealId - b.dealId)
//         .filter((d) => d.toSalary > 0),
//       dopsInfoPrevMounth: dopsInfoPrevMounth
//         .sort((a, b) => a.dealId - b.dealId)
//         .filter((d) => d.toSalary > 0),
//       prevPeriodsDealsPays,
//       prevPeriodsDopsPays,

//       groupId: m.groupId,
//       fired: m.deletedAt ? true : false,
//     };
//   }
// }
