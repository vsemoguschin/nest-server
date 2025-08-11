import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const createNewWorkSpace = async () => {
  const newWorkSpace = await prisma.workSpace.create({
    data: {
      title: 'Easyprint',
      department: 'COMMERCIAL',
    },
  });

  const newWorkSpaceGroup = await prisma.group.create({
    data: {
      title: 'Easyprint',
      workSpaceId: newWorkSpace.id,
    },
  });

  const newWorkSpaceAdSource = await prisma.adSource.create({
    data: {
      title: 'ВК таргет ИЗИПРИНТ',
      workSpaceId: newWorkSpace.id,
      groupId: newWorkSpaceGroup.id,
    },
  });
};


const createNewAdSources = async () => {
  const book = await prisma.adSource.create({
    data: {
      title: 'ВК таргет ИЗИБУК',
      workSpaceId: 3,
      groupId: 19,
    },
  });
  const svet = await prisma.adSource.create({
    data: {
      title: 'ВК таргет НОЧНИКИ',
      workSpaceId: 3,
      groupId: 17,
    },
  });
  const course = await prisma.adSource.create({
    data: {
      title: 'ВК таргет ИЗИКУРС',
      workSpaceId: 2,
      groupId: 16,
    },
  });
};

async function main() {
  try {
    await createNewWorkSpace();
    await createNewAdSources();

    const adExpense = await prisma.adExpense.findMany({
      where: {
        group: null,
      },
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
      adExpense.map(async (adex) => {
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

    const adSource = await prisma.adSource.findMany({
      where: {
        group: null,
      },
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
      adSource.map(async (adex) => {
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
