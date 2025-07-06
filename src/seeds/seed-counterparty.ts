import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function seedCounterParties() {
  try {
    // Чтение JSON-файла из корня проекта
    const filePath = path.join(process.cwd(), 'counterparties.json');
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const counterparties = JSON.parse(rawData);

    // Маппинг contrAgentTypeId на тип
    const typeMap: { [key: number]: string } = {
      1: 'Плательщик',
      2: 'Получатель',
      3: 'Смешанный',
    };

    // Подготовка данных для вставки
    const counterPartyData = counterparties.map((cp: any) => ({
      title: cp.title || '',
      type: typeMap[cp.contrAgentTypeId] || 'Смешанный', // По умолчанию "Смешанный", если тип неизвестен
      inn: cp.contrAgentInn || '',
      kpp: cp.contrAgentKpp || '',
      account: cp.contrAgentAcct || '',
      bankBic: cp.contrAgentBik || '',
      bankName: cp.contrAgentBank || '',
      contrAgentGroup: cp.contrAgentGroup?.title || 'Контрагенты без группы',
    }));

    // Вставка данных в базу с помощью upsert для предотвращения дубликатов
    for (const data of counterPartyData) {
      await prisma.counterParty.create({
        // where: { contrAgentInn: data.contrAgentInn }, // Уникальность по contrAgentInn
        // update: data,
        data
      });
    }

    console.log('Успешно заполнено:', counterPartyData.length, 'контрагентов');
  } catch (error) {
    console.error('Ошибка при заполнении базы данных:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedCounterParties().catch((e) => {
  console.error(e);
  process.exit(1);
});
