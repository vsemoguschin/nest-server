import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const updatedWorkspace = await prisma.workSpace.update({
      where: { id: 1 },
      data: { department: 'administration' },
    });
    const updatedUser = await prisma.user.update({
      where: { id: 93 },
      data: { groupId: 10, workSpaceId: 7 },
    });
    console.log('User updated:', updatedUser);
    console.log('Workspace updated:', updatedWorkspace);
  } catch (error) {
    console.error('Error updating workspace:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
