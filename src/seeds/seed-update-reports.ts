// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

const KAITEN_TOKEN = process.env.KAITEN_TOKEN;

async function main() {
  const masterReports = await prisma.masterReport.findMany();
  const packerReports = await prisma.packerReport.findMany();
  const masterRepairReports = await prisma.masterRepairReport.findMany();
  const otherReports = await prisma.otherReport.findMany();
  type Model =
    | 'masterReport'
    | 'packerReport'
    | 'masterRepairReport'
    | 'otherReport';
  type Report = {
    id: number;
    name: string;
    dealId: number | null;
    date: string;
    model: Model;
  };
  const reports = [
    ...masterReports.map<Report>((r) => ({ ...r, model: 'masterReport' })),
    ...packerReports.map<Report>((r) => ({ ...r, model: 'packerReport' })),
    ...masterRepairReports.map<Report>((r) => ({
      ...r,
      model: 'masterRepairReport',
    })),
    ...otherReports.map<Report>((r) => ({ ...r, model: 'otherReport' })),
  ];

  // Функция для создания задержки
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // Последовательная обработка с задержкой
  for (const r of reports) {
    if (r.name.includes('easyneonwork.kaiten.ru/') && !r.dealId) {
      const splitLink = r.name.split('/')[r.name.split('/').length - 1];
      const cardId = splitLink.split(' ')[0];
      const digits = cardId.replace(/[^0-9]/g, '');
      let dealId = 0;
      // console.log(digits);

      try {
        if (digits.length !== 8) {
          return console.log(digits);
        }
        const options = {
          method: 'GET',
          url: `https://easyneonwork.kaiten.ru/api/latest/cards/${digits}`,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${KAITEN_TOKEN}`,
          },
        };

        const response = await axios.request(options);
        const description = response.data.description;

        if (description) {
          // Регулярное выражение для поиска ссылок на bluesales.ru или easyneon.amocrm.ru
          const linkRegex =
            /(https:\/\/(?:bluesales\.ru|easyneon\.amocrm\.ru)[^\]\s()]*)/g;
          const match: string[] = description.match(linkRegex);

          if (match && match.length > 0) {
            const cleanLinks: string[] = [
              ...new Set(match.map((link) => link.replace(/[)\]]+$/, ''))),
            ];
            const link = cleanLinks[cleanLinks.length - 1]; // Берем первую найденную ссылку

            const deals = await prisma.deal.findMany({
              where: {
                client: {
                  chatLink: { contains: link, mode: 'insensitive' },
                },
              },
              orderBy: {
                saleDate: 'desc',
              },
            });

            // console.log(deals[0]);
            dealId = deals.length ? deals[0].id : 0;

            console.log(link, dealId, cardId);
            switch (r.model) {
              case 'masterReport':
                // console.log(r, dealId);
                await prisma.masterReport.update({
                  where: {
                    id: r.id,
                  },
                  data: {
                    dealId,
                  },
                });
                break;
              case 'packerReport':
                await prisma.packerReport.update({
                  where: {
                    id: r.id,
                  },
                  data: {
                    dealId,
                  },
                });
                break;
              case 'masterRepairReport':
                await prisma.masterRepairReport.update({
                  where: {
                    id: r.id,
                  },
                  data: {
                    dealId,
                  },
                });
                break;
              case 'otherReport':
                await prisma.otherReport.update({
                  where: {
                    id: r.id,
                  },
                  data: {
                    dealId,
                  },
                });
                break;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching Kaiten card:', error);
      }

      // Задержка 1 секунда (1000 мс) перед следующим промисом
      await delay(200);
    }
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
