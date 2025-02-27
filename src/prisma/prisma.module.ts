import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Делает модуль глобальным, чтобы его провайдеры были доступны во всем приложении
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
