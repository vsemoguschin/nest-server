import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VkAdsStatsService } from '../domains/vk-ads/vk-ads.stats.service';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    await prisma.vkAdsDailyStat.deleteMany();
    console.log('reset done');
    const stats = app.get(VkAdsStatsService);
    // Диапазон для сбора: 2025-01-01 .. 2025-10-01
    const from = '2025-01-01';
    const to = '2025-09-27';
    for (const project of ['neon', 'book'] as const) {
      console.log(project + ' start');
      for (const entity of ['banners', 'ad_groups', 'ad_plans'] as const) {
        console.log(entity + ' start');
        await stats.collectRange(project, entity, from, to);
      }
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
