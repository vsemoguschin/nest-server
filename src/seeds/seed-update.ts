import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  const role = await prisma.role.create({
    data: {
      department: 'FINANCE',
      fullName: 'Финансист',
      shortName: 'FINANCIER',
    }
  });

  console.log(role);
}

main();
