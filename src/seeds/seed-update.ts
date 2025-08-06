import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  try {
    const adSources = await prisma.adSource.findMany({
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
      adSources.map(async (adex) => {
        const { workSpace, groupId } = adex;
        // console.log(r.groupId);
        if (!groupId) {
          const primalGroup = workSpace.groups.sort((a, b) => a.id - b.id)[0];
          await prisma.adSource.update({
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
