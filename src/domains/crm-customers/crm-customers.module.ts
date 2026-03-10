import { Module } from '@nestjs/common';
import { BlueSalesCustomerPageService } from '../../integrations/bluesales/bluesales-customer-page.service';
import { BlueSalesRibbonEventsParser } from '../../integrations/bluesales/bluesales-ribbon-events.parser';
import { BlueSalesSessionService } from '../../integrations/bluesales/bluesales-session.service';
import { VkMessagesModule } from '../vk-messages/vk-messages.module';
import { CrmCustomerCommunicationsService } from './crm-customer-communications.service';
import { CrmCustomerAiAssistantService } from './crm-customer-ai-assistant.service';
import { CrmCustomerBlueSalesService } from './crm-customer-bluesales.service';
import { CrmCustomerRibbonEventsService } from './crm-customer-ribbon-events.service';
import { CrmVkDialogsService } from './crm-vk-dialogs.service';
import { CrmCustomersController } from './crm-customers.controller';
import { CrmCustomersService } from './crm-customers.service';

@Module({
  imports: [VkMessagesModule],
  controllers: [CrmCustomersController],
  providers: [
    CrmCustomersService,
    CrmCustomerCommunicationsService,
    CrmCustomerAiAssistantService,
    CrmCustomerBlueSalesService,
    CrmCustomerRibbonEventsService,
    CrmVkDialogsService,
    BlueSalesSessionService,
    BlueSalesCustomerPageService,
    BlueSalesRibbonEventsParser,
  ],
})
export class CrmCustomersModule {}
