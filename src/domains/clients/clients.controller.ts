import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/client-create.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from '../users/dto/user.dto';
import { ClientDto } from './dto/client.dto';
import { UpdateClientDto } from './dto/client-update.dto';

@UseGuards(RolesGuard)
@ApiTags('clients')
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiOperation({
    summary: 'Создать клиента',
    description: 'Endpoint: POST /clients. Создает нового клиента.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async create(
    @Body() createClientDto: CreateClientDto,
    @CurrentUser() user: UserDto,
  ): Promise<CreateClientDto> {
    return this.clientsService.create(createClientDto, user);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Редактировать клиента',
    description: 'Endpoint: PATCH /clients. Редактировать клиента.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateClientDto: UpdateClientDto,
    @CurrentUser() user: UserDto,
  ) {
    return this.clientsService.update(id, updateClientDto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'Получить всех клиентов',
    description: 'Endpoint: GET /clients. Получить всех клиентов.',
  })
  @Roles('ADMIN', 'G', 'KD', 'DO', 'MOP', 'ROP', 'ROV', 'MOV')
  async getList(@Query('chatLink') chatLink: string): Promise<ClientDto[]> {
    return this.clientsService.getList(chatLink);
  }
}
