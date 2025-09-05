// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const KAITEN_TOKEN = process.env.KAITEN_TOKEN;

async function main() {
  const group = await prisma.group.create({
    data: {
      title: 'ассистенты',
      workSpaceId: 7,
    },
  });
  const role = await prisma.role.create({
    data: {
      shortName: 'ASSISTANT',
      fullName: 'Ассистент',
      department: 'ASSISTANTS',
    },
  });
  const hashedPassword = await bcrypt.hash('katrinawkss', 3);
  const user = await prisma.user.create({
    data: {
      fullName: 'Помощник Катя',
      tg: '@katrinawkss',
      tg_id: 422467124,
      email: 'katrinawkss',
      password: hashedPassword,
      roleId: role.id,
      workSpaceId: 7,
      groupId: group.id,
    },
  });
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
