import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
// Импортируйте другие модули
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './domains/users/users.module';
import { RolesModule } from './domains/roles/roles.module';
import { WorkspacesModule } from './domains/workspaces/workspaces.module';
import { GroupsModule } from './domains/groups/groups.module';
import { WorkspaceGroupsController } from './domains/workspace-groups/workspace-groups.controller';
import { WorkspaceGroupsModule } from './domains/workspace-groups/workspace-groups.module';
import { ProfileModule } from './profile/profile.module';
import { ProfileService } from './profile/profile.service';
import { DashboardsModule } from './domains/dashboards/dashboards.module';
import { DealsModule } from './domains/deals/deals.module';
import { ClientsModule } from './domains/clients/clients.module';
import { PaymentsModule } from './domains/payments/payments.module';
import { DopsModule } from './domains/dops/dops.module';
import { ManagersModule } from './domains/managers/managers.module';
import { ReportsModule } from './domains/reports/reports.module';
import { AdModule } from './domains/ad/ad.module';


@Module({
  imports: [
    PrismaModule,  // Теперь PrismaService доступен глобально
    AuthModule,
    ProfileModule,
    RolesModule,
    UsersModule,
    WorkspacesModule,
    GroupsModule,
    WorkspaceGroupsModule,
    DashboardsModule,
    DealsModule,
    ClientsModule,
    PaymentsModule,
    DopsModule,
    ManagersModule,
    ReportsModule,
    AdModule,
    // другие модули
  ],
  controllers: [WorkspaceGroupsController],
  providers: [ProfileService],
})
export class AppModule {}
