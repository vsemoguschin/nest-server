import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const reports = await prisma.ropReport.findMany({
      include: {
        workSpace: {
          include: {
            groups: true,
          },
        },
        group: true,
      },
    });
    await Promise.all(
      reports.map(async (r) => {
        const { workSpace, group, groupId } = r;
        // console.log(r.groupId);
        if (!groupId) {
          const primalGroup = workSpace.groups.sort((a, b) => a.id - b.id)[0];
          await prisma.ropReport.update({
            where: {
              id: r.id,
            },
            data: {
              groupId: primalGroup.id,
            },
          });
          // console.log(primalGroup);
        }
      }),
    );

    const adExpenses = await prisma.adExpense.findMany({
      include: {
        workSpace: {
          include: {
            groups: true,
          },
        },
        group: true,
      },
    });

    await Promise.all(
      adExpenses.map(async (adex) => {
        const { workSpace, groupId } = adex;
        // console.log(r.groupId);
        if (!groupId) {
          const primalGroup = workSpace.groups.sort((a, b) => a.id - b.id)[0];
          await prisma.adExpense.update({
            where: {
              id: adex.id,
            },
            data: {
              groupId: primalGroup.id,
            },
          });
          // console.log(primalGroup);
        }
      }),
    );
  } catch (e) {
    console.log(e);
  }
}

main();
