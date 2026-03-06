import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CrmCustomerCommunicationsService } from './crm-customer-communications.service';
import { CrmCustomerRibbonEventsService } from './crm-customer-ribbon-events.service';
import { CrmVkDialogsService } from './crm-vk-dialogs.service';
import { CrmCustomersService } from './crm-customers.service';
import { ListCrmVkDialogsQueryDto } from './dto/list-crm-vk-dialogs.query.dto';
import { ListCrmCustomersQueryDto } from './dto/list-crm-customers.query.dto';

@ApiTags('crm-customers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/customers')
export class CrmCustomersController {
  constructor(
    private readonly crmCustomersService: CrmCustomersService,
    private readonly crmCustomerCommunicationsService: CrmCustomerCommunicationsService,
    private readonly crmCustomerRibbonEventsService: CrmCustomerRibbonEventsService,
    private readonly crmVkDialogsService: CrmVkDialogsService,
  ) {}

  private pickOptionalQueryString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }

    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === 'string');
      if (typeof first === 'string') {
        const normalized = first.trim();
        return normalized.length > 0 ? normalized : undefined;
      }
    }

    return undefined;
  }

  @Get('filters')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Справочники фильтров CRM-клиентов',
    description:
      'Возвращает доступные CRM-аккаунты, статусы, теги и менеджеров для страницы клиентов.',
  })
  @ApiOkResponse({
    description: 'Справочники фильтров',
    schema: {
      example: {
        accounts: [
          {
            id: 1,
            code: 'easybook',
            name: 'ИзиБук',
          },
        ],
        statuses: [
          {
            id: 1,
            name: 'Новый клиент',
            color: '#22c55e',
            type: 1,
          },
        ],
        tags: [
          {
            id: 10,
            name: 'VIP',
            color: '#fde68a',
            textColor: '#92400e',
          },
        ],
        managers: [
          {
            id: 3,
            fullName: 'Иван Петров',
          },
        ],
      },
    },
  })
  async filters(
    @Query('accountId', new ParseIntPipe({ optional: true }))
    accountId?: number,
  ) {
    return this.crmCustomersService.listFilters(accountId);
  }

  @Get()
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Список CRM-клиентов (MVP без include связей)',
    description:
      'Cursor-пагинация с сортировкой по updatedAt desc, id desc и фильтрами q(fullName)/statusIds/tagIds/managerIds.',
  })
  @ApiOkResponse({
    description: 'Страница CRM-клиентов',
    schema: {
      example: {
        items: [
          {
            id: 101,
            externalId: '123456',
            fullName: 'Иван Иванов',
            photoUrl: '',
            firstContactDate: '2026-03-01',
            lastContactDate: '2026-03-02',
            nextContactDate: '',
            cityName: 'Москва',
            crmStatusName: 'Новый клиент',
            crmStatusColor: '#22c55e',
            crmTags: [
              {
                id: 1,
                name: 'VIP',
                color: '#fde68a',
                textColor: '#92400e',
              },
            ],
            sourceName: 'Instagram',
            salesChannelName: 'Переписка',
            managerName: 'Иван Петров',
            vkExternalId: '213329253',
          },
        ],
        nextCursor:
          'eyJ1cGRhdGVkQXQiOiIyMDI2LTAzLTAzVDEwOjAwOjAwLjAwMFoiLCJpZCI6MTAxfQ',
        hasMore: true,
        meta: {
          limit: 30,
          total: 28009,
        },
      },
    },
  })
  async list(@Query() query: ListCrmCustomersQueryDto) {
    return this.crmCustomersService.list(query);
  }

  @Get('vk-dialogs')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Список VK-диалогов с CRM-фильтрами',
    description:
      'Возвращает список VK-диалогов по source с возможностью CRM-фильтрации по статусам, тегам и менеджерам.',
  })
  async listVkDialogs(
    @Query() query: ListCrmVkDialogsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.crmVkDialogsService.list(query);
    res.status(result.status);
    return result.data;
  }

  @Get(':id')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Карточка CRM-клиента',
    description:
      'Возвращает детальные данные CRM-клиента для страницы карточки.',
  })
  @ApiOkResponse({
    description: 'Детальные данные CRM-клиента',
    schema: {
      example: {
        id: 101,
        externalId: '123456',
        fullName: 'Иван Иванов',
        photoUrl: '',
        accountName: 'ИзиБук',
        accountCode: 'easybook',
        birthday: '06.03.1990',
        sex: 'm',
        phone: '+7 999 123-45-67',
        email: 'ivan@example.com',
        address: 'Москва, ул. Пушкина, 1',
        otherContacts: '',
        firstContactDate: '2026-03-01',
        lastContactDate: '2026-03-02',
        nextContactDate: '',
        shortNotes: '',
        comments: '',
        countryName: 'Россия',
        cityName: 'Москва',
        crmStatusName: 'Новый клиент',
        crmStatusColor: '#22c55e',
        crmTags: [
          {
            id: 1,
            name: 'VIP',
            color: '#fde68a',
            textColor: '#92400e',
          },
        ],
        sourceName: 'Instagram',
        salesChannelName: 'Переписка',
        managerName: 'Иван Петров',
        vkExternalId: '213329253',
        vkName: 'Иван Иванов',
        vkMessagesGroupId: '8340213176',
        avitoExternalId: '',
        avitoName: '',
        avitoChatId: '',
      },
    },
  })
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.crmCustomersService.getOne(id);
  }

  @Get(':id/ribbon-events')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Лента событий CRM-клиента из BlueSales',
    description:
      'Возвращает ленту событий клиента из HTML CustomerView.aspx в BlueSales.',
  })
  @ApiOkResponse({
    description: 'Лента событий клиента',
    schema: {
      example: {
        items: [
          {
            id: 'ribbon-deadbeef',
            dateLabel: '06.03.2026 в 11:12',
            occurredAt: '2026-03-06T11:12:00+03:00',
            contentHtml:
              '<a href="https://bluesales.ru/app/Administration/ClientDetails.aspx?Id=60936" target="_blank" rel="noopener noreferrer">Ведение 4</a> сменил статус с <strong><span style="color: #0165B0">Вторая оплата</span></strong> на <strong><span style="color: #FF9900">На производстве</span></strong>',
            contentText:
              'Ведение 4 сменил статус с Вторая оплата на На производстве',
          },
        ],
        requestedCount: 30,
        nextCount: 60,
        hasMore: true,
      },
    },
  })
  async getRibbonEvents(
    @Param('id', ParseIntPipe) id: number,
    @Query('count') count?: string,
  ) {
    return this.crmCustomerRibbonEventsService.getRibbonEvents(id, count);
  }

  @Get(':id/vk-dialog')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'История VK-диалога CRM-клиента',
    description:
      'Возвращает историю VK-диалога по customerId. Источник и peer_id определяются на backend через CrmCustomer.',
  })
  async getVkDialogHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.crmCustomerCommunicationsService.getVkDialogHistory(
      id,
      query,
    );
    res.status(result.status);
    return result.data;
  }

  @Post(':id/vk-dialog/messages')
  @Roles('ADMIN', 'G', 'KD')
  @UseInterceptors(AnyFilesInterceptor())
  @ApiOperation({
    summary: 'Отправка сообщения в VK-диалог CRM-клиента',
    description:
      'Отправляет текст и файлы в VK-диалог по customerId. Источник и peer_id определяются на backend через CrmCustomer.',
  })
  async sendVkDialogMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[],
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalizedBody = {
      ...body,
      v: this.pickOptionalQueryString(body.v),
      random_id: this.pickOptionalQueryString(body.random_id),
      payload: this.pickOptionalQueryString(body.payload),
      message: this.pickOptionalQueryString(body.message),
    };

    const result =
      await this.crmCustomerCommunicationsService.sendVkDialogMessage(
        id,
        normalizedBody,
        files,
      );

    res.status(result.status);
    return result.data;
  }
}
