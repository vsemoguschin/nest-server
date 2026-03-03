import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CrmCustomersService } from './crm-customers.service';
import { ListCrmCustomersQueryDto } from './dto/list-crm-customers.query.dto';

@ApiTags('crm-customers')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('crm/customers')
export class CrmCustomersController {
  constructor(private readonly crmCustomersService: CrmCustomersService) {}

  @Get('filters')
  @Roles('ADMIN', 'G', 'KD')
  @ApiOperation({
    summary: 'Справочники фильтров CRM-клиентов',
    description:
      'Возвращает доступные CRM-статусы, теги, менеджеров, города и агрегированные totals по справочникам.',
  })
  @ApiOkResponse({
    description: 'Справочники фильтров',
    schema: {
      example: {
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
        cities: [
          {
            id: 12,
            name: 'Москва',
            countries: [
              {
                id: 1,
                name: 'Россия',
              },
            ],
          },
        ],
        totals: {
          statuses: 12,
          tags: 238,
          countries: 14,
          cities: 420,
          sources: 27,
          salesChannels: 8,
          managers: 16,
          vk: 9000,
          avito: 1200,
        },
      },
    },
  })
  async filters() {
    return this.crmCustomersService.listFilters();
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
}
