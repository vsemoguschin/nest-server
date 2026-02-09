import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const groupId = 17;
  const title = 'ИзиБук 2';

  try {
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: { title },
      select: { id: true, title: true },
    });

    console.log(
      `[Group Seed] Updated group id=${updated.id} title="${updated.title}"`,
    );
  } catch (error) {
    console.error('[Group Seed] Failed to update group', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
