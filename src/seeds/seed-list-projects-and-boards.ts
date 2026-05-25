import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EASYBOOK_PROJECT_ID = 2;
const EASYNEON_PROJECT_ID = 3;
const EASYBOOK_BOARD_IDS = [9, 12, 17, 18, 19];

async function main() {
  await prisma.$transaction(async (tx) => {
    const [easybookProject, easyneonProject, easybookBoards] =
      await Promise.all([
        tx.project.findUnique({
          where: { id: EASYBOOK_PROJECT_ID },
          select: { id: true },
        }),
        tx.project.findUnique({
          where: { id: EASYNEON_PROJECT_ID },
          select: { id: true },
        }),
        tx.board.findMany({
          where: { id: { in: EASYBOOK_BOARD_IDS } },
          select: { id: true },
        }),
      ]);

    if (!easybookProject) {
      throw new Error(`Project with id=${EASYBOOK_PROJECT_ID} not found`);
    }

    if (!easyneonProject) {
      throw new Error(`Project with id=${EASYNEON_PROJECT_ID} not found`);
    }

    if (easybookBoards.length !== EASYBOOK_BOARD_IDS.length) {
      const foundIds = new Set(easybookBoards.map((board) => board.id));
      const missingIds = EASYBOOK_BOARD_IDS.filter((id) => !foundIds.has(id));
      throw new Error(
        `Board(s) not found: ${missingIds.map((id) => String(id)).join(', ')}`,
      );
    }

    await tx.board.updateMany({
      data: { projectId: EASYNEON_PROJECT_ID },
    });

    await tx.board.updateMany({
      where: { id: { in: EASYBOOK_BOARD_IDS } },
      data: { projectId: EASYBOOK_PROJECT_ID },
    });
  });

  const boards = await prisma.board.findMany({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      title: true,
      projectId: true,
      project: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
    },
  });

  console.log('Boards after assignment:');
  for (const board of boards) {
    const projectId = board.projectId ?? 'null';
    const projectCode = board.project?.code ?? 'null';
    const projectName = board.project?.name ?? 'null';
    console.log(
      `- id: ${board.id} | title: ${board.title} | projectId: ${projectId} | projectCode: ${projectCode} | projectName: ${projectName}`,
    );
  }
}

main()
  .catch((error) => {
    console.error('[seed-list-projects-and-boards] Ошибка:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
