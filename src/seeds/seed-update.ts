import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const ws = await prisma.workSpace.create({
      data: {
        title: 'Производство Пермь',
        department: 'PRODUCTION',
      }
    })
    await prisma.group.createMany({
      data: [
        {
          title: 'Сборщики',
          workSpaceId: ws.id
        },
        {
          title: 'Упаковщики',
          workSpaceId: ws.id
        },
        {
          title: 'Фрезеровка/Пленка',
          workSpaceId: ws.id
        },
        {
          title: 'Руководители',
          workSpaceId: ws.id
        },
      ]
    })
    // await prisma.operation.deleteMany({});
    // await prisma.operationPosition.deleteMany({});
    // await prisma.operationPosition.deleteMany();
    // await prisma.operation.deleteMany({
    //   where: {
    //     deletedAt: {
    //       not: null,
    //     },
    //   },
    // });
  } catch (e) {
    console.log(e);
  }
  // const accounts = [
  //   {
  //     name: 'Основной счет 7213',
  //     accountNumber: '40802810800000977213',
  //     balance: 0,
  //     type: 'Безналичный',
  //   },
  //   {
  //     name: 'Кредитный счет 4658',
  //     accountNumber: '40802810900002414658',
  //     balance: 0,
  //     type: 'Безналичный',
  //   },
  // ];
  // const data = await prisma.planFactAccount.createMany({
  //   data: accounts,
  // });
}

main();
