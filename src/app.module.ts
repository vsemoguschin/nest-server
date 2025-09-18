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
import { SalariesModule } from './domains/salaries/salaries.module';
import { SalaryPaysModule } from './domains/salary-pays/salary-pays.module';
import { DeliveriesModule } from './domains/deliveries/deliveries.module';
import { FilesModule } from './domains/files/files.module';
import { ReviewsModule } from './domains/reviews/reviews.module';
import { PlanfactModule } from './domains/planfact/planfact.module';
import { WebhooksModule } from './domains/webhooks/webhooks.module';
import { SuppliesModule } from './domains/supplies/supplies.module';
import { WbModule } from './domains/wb/wb.module';
import { ProductionModule } from './domains/production/production.module';
import { BoardsModule } from './domains/boards/boards.module';
import { ColumnsModule } from './domains/columns/columns.module';
import { TasksModule } from './domains/board_tasks/board_tasks.module';
import { KanbanFilesModule } from './domains/kanban-files/kanban-files.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationSchedulerService } from './notifications/notification-scheduler.service';
import { BluesalesImportService } from './integrations/bluesales/bluesales-import.service';
import { TelegramService } from './services/telegram.service';
import { AttachmentsModule } from './domains/kanban/attachments/attachments.module';
import { MembersModule } from './domains/kanban/members/members.module';
import { CommentsModule } from './domains/kanban/comments/comments.module';
import { VkAdsModule } from './domains/vk-ads/vk-ads.module';

@Module({
  imports: [
    PrismaModule, // Теперь PrismaService доступен глобально
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
    SalariesModule,
    SalaryPaysModule,
    DeliveriesModule,
    FilesModule,
    ReviewsModule,
    PlanfactModule,
    WebhooksModule,
    SuppliesModule,
    WbModule,
    ProductionModule,
    BoardsModule,
    ColumnsModule,
    TasksModule,
    KanbanFilesModule,
    ScheduleModule.forRoot(),
    AttachmentsModule,
    MembersModule,
    CommentsModule,
    VkAdsModule,

    // другие модули
  ],
  controllers: [WorkspaceGroupsController],
  providers: [ProfileService, TelegramService, NotificationSchedulerService, BluesalesImportService],
  exports: [NotificationSchedulerService],
})
export class AppModule {}
