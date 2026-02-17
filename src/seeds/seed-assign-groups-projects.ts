import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = ['1', 'true', 'yes'].includes(
  String(process.env.APPLY ?? '').toLowerCase(),
);
const PRINT = process.env.PRINT
  ? ['1', 'true', 'yes'].includes(String(process.env.PRINT).toLowerCase())
  : true;

const PROJECT_1_GROUP_IDS = [1, 10, 11, 25];
const PROJECT_2_GROUP_IDS = [17, 19];
const DESIGN_BOOKS_GROUP_TITLE = 'Диз книги';
const DESIGN_BOOKS_PROJECT_ID = 2;
const DESIGN_BOOKS_WORKSPACE_ID = Number(
  process.env.DESIGN_BOOKS_WORKSPACE_ID ?? 0,
);
const DESIGN_BOOKS_USER_FULL_NAMES = [
  'Стародубцева Диана',
  'Лощенкова Софья',
  'Резниченко Мария',
  'Рюмшина Мария',
  'Дадыко Анастасия',
  'Терехова Карина',
  'Соломатина Анастасия',
  'Митяева Елена',
  'Дроголова Галина',
  'Рачева Екатерина',
  'Вайсман Кристина',
  'Вьюшина Яна',
  'Алина Галиаскарова',
  'Матросова Мария',
  'Волошина Карина',
  'Осипова Полина',
  'Бондарь Ольга',
  'Ефимова Дарья',
  'Каминская Ксения',
  'Абакумова Ксения',
  'Миненок Яна',
  'Абросимова Александра',
  'Карташова Екатерина',
  'Поканевич Анастасия',
];

type GroupRow = {
  id: number;
  title: string;
  projectId: number | null;
  workSpace: {
    title: string;
  };
};

type UserRow = {
  id: number;
  fullName: string;
  workSpaceId: number;
};

const getAllGroups = async (): Promise<GroupRow[]> =>
  prisma.group.findMany({
    select: {
      id: true,
      title: true,
      projectId: true,
      workSpace: {
        select: {
          title: true,
        },
      },
    },
    orderBy: { id: 'asc' },
  });

async function resolveDesignBooksWorkSpaceId(users: UserRow[]) {
  if (DESIGN_BOOKS_WORKSPACE_ID > 0) {
    return DESIGN_BOOKS_WORKSPACE_ID;
  }

  const project2Group = await prisma.group.findFirst({
    where: { projectId: DESIGN_BOOKS_PROJECT_ID },
    select: {
      id: true,
      title: true,
      workSpaceId: true,
    },
    orderBy: { id: 'asc' },
  });

  if (project2Group) {
    return project2Group.workSpaceId;
  }

  const userWorkSpaceIds = Array.from(
    new Set(users.map((user) => user.workSpaceId)),
  );

  if (userWorkSpaceIds.length === 1) {
    return userWorkSpaceIds[0];
  }

  throw new Error(
    '[Seed] Cannot resolve workSpaceId for "Диз книги". Set DESIGN_BOOKS_WORKSPACE_ID explicitly.',
  );
}

async function ensureDesignBooksGroupAndUsers() {
  const users = await prisma.user.findMany({
    where: {
      fullName: {
        in: DESIGN_BOOKS_USER_FULL_NAMES,
      },
      groupId: 9,
      deletedAt: null,
    },
    select: {
      id: true,
      fullName: true,
      workSpaceId: true,
    },
    orderBy: { id: 'asc' },
  });

  const foundNames = new Set(users.map((user) => user.fullName));
  const missingNames = DESIGN_BOOKS_USER_FULL_NAMES.filter(
    (name) => !foundNames.has(name),
  );

  const nameCounter = new Map<string, number>();
  for (const user of users) {
    nameCounter.set(user.fullName, (nameCounter.get(user.fullName) ?? 0) + 1);
  }
  const duplicatedNames = Array.from(nameCounter.entries())
    .filter(([, count]) => count > 1)
    .map(([name]) => name);

  const existingGroups = await prisma.group.findMany({
    where: { title: DESIGN_BOOKS_GROUP_TITLE },
    select: {
      id: true,
      title: true,
      projectId: true,
      workSpaceId: true,
    },
    orderBy: { id: 'asc' },
  });

  if (existingGroups.length > 1) {
    console.warn(
      `[Seed] Found multiple groups with title "${DESIGN_BOOKS_GROUP_TITLE}". Using first id=${existingGroups[0].id}.`,
    );
  }

  let designBooksGroup = existingGroups[0];
  if (!designBooksGroup) {
    const workSpaceId = await resolveDesignBooksWorkSpaceId(users);
    designBooksGroup = await prisma.group.create({
      data: {
        title: DESIGN_BOOKS_GROUP_TITLE,
        projectId: DESIGN_BOOKS_PROJECT_ID,
        workSpaceId,
      },
      select: {
        id: true,
        title: true,
        projectId: true,
        workSpaceId: true,
      },
    });
    console.log(
      `[Seed] Created group "${DESIGN_BOOKS_GROUP_TITLE}" id=${designBooksGroup.id}, workSpaceId=${designBooksGroup.workSpaceId}`,
    );
  }

  if (designBooksGroup.projectId !== DESIGN_BOOKS_PROJECT_ID) {
    designBooksGroup = await prisma.group.update({
      where: { id: designBooksGroup.id },
      data: { projectId: DESIGN_BOOKS_PROJECT_ID },
      select: {
        id: true,
        title: true,
        projectId: true,
        workSpaceId: true,
      },
    });
    console.log(
      `[Seed] Group "${DESIGN_BOOKS_GROUP_TITLE}" set to projectId=${DESIGN_BOOKS_PROJECT_ID}`,
    );
  }

  if (missingNames.length > 0 || duplicatedNames.length > 0) {
    console.warn('[Seed] Users assignment to "Диз книги" skipped.');
    if (missingNames.length > 0) {
      console.warn(
        `[Seed] Missing users (${missingNames.length}): ${missingNames.join(', ')}`,
      );
    }
    if (duplicatedNames.length > 0) {
      console.warn(
        `[Seed] Duplicate fullName users (${duplicatedNames.length}): ${duplicatedNames.join(', ')}`,
      );
    }

    return {
      groupId: designBooksGroup.id,
      usersAssigned: false,
    };
  }

  const updateResult = await prisma.user.updateMany({
    where: {
      id: {
        in: users.map((user) => user.id),
      },
    },
    data: {
      groupId: designBooksGroup.id,
    },
  });

  console.log(
    `[Seed] Assigned users to "${DESIGN_BOOKS_GROUP_TITLE}": ${updateResult.count}`,
  );

  return {
    groupId: designBooksGroup.id,
    usersAssigned: true,
  };
}

async function assignProjectsToGroups(
  groups: GroupRow[],
  extraProject2GroupIds: number[] = [],
) {
  const groupIds = new Set(groups.map((group) => group.id));
  const project1Ids = PROJECT_1_GROUP_IDS.filter((id) => groupIds.has(id));
  const project2ConfiguredIds = Array.from(
    new Set([...PROJECT_2_GROUP_IDS, ...extraProject2GroupIds]),
  );
  const project2Ids = project2ConfiguredIds.filter((id) => groupIds.has(id));
  const project3Ids = groups
    .map((group) => group.id)
    .filter((id) => !project1Ids.includes(id) && !project2Ids.includes(id));

  const missingProject1Groups = PROJECT_1_GROUP_IDS.filter(
    (id) => !groupIds.has(id),
  );
  const missingProject2Groups = PROJECT_2_GROUP_IDS.filter(
    (id) => !groupIds.has(id),
  );
  if (missingProject1Groups.length > 0 || missingProject2Groups.length > 0) {
    console.warn(
      '[Seed] Some configured groups are missing in DB:',
      JSON.stringify(
        {
          project1Missing: missingProject1Groups,
          project2Missing: missingProject2Groups,
        },
        null,
        2,
      ),
    );
  }

  const projects = await prisma.project.findMany({
    where: {
      id: {
        in: [1, 2, 3],
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const existingProjectIds = new Set(projects.map((project) => project.id));
  const requiredProjectIds = [1, 2, 3];
  const missingProjects = requiredProjectIds.filter(
    (projectId) => !existingProjectIds.has(projectId),
  );

  if (missingProjects.length > 0) {
    throw new Error(
      `[Seed] Required projects are missing: ${missingProjects.join(', ')}`,
    );
  }

  const { project1Res, project2Res, project3Res } = await prisma.$transaction(
    async (tx) => {
      let project1Res = 0;
      let project2Res = 0;
      let project3Res = 0;

      if (project1Ids.length > 0) {
        const result = await tx.group.updateMany({
          where: {
            id: {
              in: project1Ids,
            },
          },
          data: {
            projectId: 1,
          },
        });
        project1Res = result.count;
      }

      if (project2Ids.length > 0) {
        const result = await tx.group.updateMany({
          where: {
            id: {
              in: project2Ids,
            },
          },
          data: {
            projectId: 2,
          },
        });
        project2Res = result.count;
      }

      if (project3Ids.length > 0) {
        const result = await tx.group.updateMany({
          where: {
            id: {
              in: project3Ids,
            },
          },
          data: {
            projectId: 3,
          },
        });
        project3Res = result.count;
      }

      return { project1Res, project2Res, project3Res };
    },
  );

  console.log('[Seed] Assignment complete');
  console.log(`[Seed] projectId=1 updated groups: ${project1Res}`);
  console.log(`[Seed] projectId=2 updated groups: ${project2Res}`);
  console.log(`[Seed] projectId=3 updated groups: ${project3Res}`);
}

async function run() {
  try {
    if (!APPLY && !PRINT) {
      console.log('[Seed] Nothing to do. Set APPLY=1 and/or PRINT=1.');
      return;
    }

    let extraProject2GroupIds: number[] = [];
    if (APPLY) {
      const designBooksResult = await ensureDesignBooksGroupAndUsers();
      extraProject2GroupIds = [designBooksResult.groupId];
      const groupsForAssignment = await getAllGroups();
      await assignProjectsToGroups(groupsForAssignment, extraProject2GroupIds);
    }

    if (PRINT) {
      const [projects, groups] = await Promise.all([
        prisma.project.findMany({
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
        }),
        getAllGroups(),
      ]);

      const groupsForOutput = groups.map((group) => ({
        id: group.id,
        name: group.title,
        workSpaceTitle: group.workSpace.title,
        projectId: group.projectId,
      }));

      console.log('[Seed] Projects (id, name):');
      console.table(projects);

      // console.log('[Seed] Groups (id, name, workSpace.title, projectId):');
      // console.table(groupsForOutput);

      console.log('[Seed] Projects -> groups:');
      for (const project of projects) {
        const projectGroups = groups
          .filter((group) => group.projectId === project.id)
          .map((group) => ({
            id: group.id,
            title: group.title,
            workSpaceTitle: group.workSpace.title,
          }));

        console.log(
          `\n[Project] #${project.id} ${project.name} (groups: ${projectGroups.length})`,
        );

        if (projectGroups.length === 0) {
          console.log('  - (нет групп)');
          continue;
        }

        for (const group of projectGroups) {
          console.log(
            `  - #${group.id} ${group.title} [workspace: ${group.workSpaceTitle}]`,
          );
        }
      }
    }
  } catch (error) {
    console.error('[Seed] Failed to assign/print projects/groups', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
