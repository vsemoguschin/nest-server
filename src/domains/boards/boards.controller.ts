import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BoardsService } from './boards.service';
import { CreateBoardDto } from './dto/create-board.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserDto } from '../users/dto/user.dto';
import { CreateBoardTagDto } from './dto/create-board-tag.dto';
import { BoardIdDto } from './dto/board-id.dto';
import { KanbanFiltersService } from './kanban-filters.service';
import { KanbanColumnsService } from './kanban-columns.service';

@ApiTags('Boards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('boards')
export class BoardsController {
  constructor(
    private readonly boardsService: BoardsService,
    private readonly kanbanFiltersService: KanbanFiltersService,
    private readonly kanbanColumnsService: KanbanColumnsService,
  ) {}

  /** Список всех активных пользователей (для добавления) */
  @Get('users')
  listAllUsers() {
    return this.boardsService.listAllUsers();
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST',
    'MASTER',
    'RP',
    'FRZ',
    'PACKER',
    'GUEST',
  )
  @Get(':id/kanban')
  async getKanban(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) boardId: number,
    @Query('hidden') hidden?: string, // CSV: "1,2,3"
    @Query('visibleMembers') visibleMembers?: string, // CSV user ids
  ) {
    const parseCsvNumbers = (value: string | undefined) =>
      (value ?? '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));

    const hiddenIds = parseCsvNumbers(hidden);
    const visibleMemberIds =
      typeof visibleMembers === 'string'
        ? parseCsvNumbers(visibleMembers)
        : undefined;

    return this.boardsService.getKanban(
      user,
      boardId,
      hiddenIds,
      visibleMemberIds,
    );
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST',
    'MASTER',
    'RP',
    'FRZ',
    'PACKER',
    'GUEST',
  )
  @Get(':id/kanban-filters')
  async getKanbanFilters(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) boardId: number,
    @Query('hidden') hidden?: string,
    @Query('visibleMembers') visibleMembers?: string,
  ) {
    const parseCsvNumbers = (value: string | undefined) =>
      (value ?? '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));

    const hiddenIds = parseCsvNumbers(hidden);
    const visibleMemberIds =
      typeof visibleMembers === 'string'
        ? parseCsvNumbers(visibleMembers)
        : undefined;

    return this.kanbanFiltersService.getKanbanFilters(
      user,
      boardId,
      hiddenIds,
      visibleMemberIds,
    );
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST',
    'MASTER',
    'RP',
    'FRZ',
    'PACKER',
    'GUEST',
  )
  @Get(':id/kanban-columns')
  async getKanbanColumns(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) boardId: number,
    @Query('hidden') hidden?: string,
    @Query('visibleMembers') visibleMembers?: string,
  ) {
    const parseCsvNumbers = (value: string | undefined) =>
      (value ?? '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));

    const hiddenIds = parseCsvNumbers(hidden);
    const visibleMemberIds =
      typeof visibleMembers === 'string'
        ? parseCsvNumbers(visibleMembers)
        : undefined;

    return this.kanbanColumnsService.getKanbanColumns(
      user,
      boardId,
      hiddenIds,
      visibleMemberIds,
    );
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST',
    'MASTER',
    'RP',
    'FRZ',
    'PACKER',
    'GUEST',
  )
  @Get(':boardId/kanban/columns/:columnId')
  async getKanbanColumn(
    @CurrentUser() user: UserDto,
    @Param('boardId', ParseIntPipe) boardId: number,
    @Param('columnId', ParseIntPipe) columnId: number,
    @Query('visibleMembers') visibleMembers?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parseCsvNumbers = (value: string | undefined) =>
      (value ?? '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));

    const visibleMemberIds =
      typeof visibleMembers === 'string'
        ? parseCsvNumbers(visibleMembers)
        : undefined;
    const page = {
      cursor:
        typeof cursor === 'string' && Number.isFinite(parseInt(cursor, 10))
          ? parseInt(cursor, 10)
          : undefined,
      limit:
        typeof limit === 'string' && Number.isFinite(parseInt(limit, 10))
          ? Math.min(Math.max(parseInt(limit, 10), 1), 2000)
          : undefined,
    };

    return this.kanbanColumnsService.getKanbanColumn(
      user,
      boardId,
      columnId,
      visibleMemberIds,
      page,
    );
  }

  @Roles('ADMIN', 'G', 'KD', 'DO')
  @Post()
  async createBoard(@CurrentUser() user: UserDto, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(user.id, dto);
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'LOGIST',
    'FRZ',
    'MASTER',
    'RP',
    'PACKER',
    'GUEST',
  )
  @Get()
  async listBoards(@CurrentUser() user: UserDto) {
    return this.boardsService.listForUser(user);
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'ASSISTANT',
    'LOGIST',
    'MASTER',
    'RP',
    'PACKER',
    'FRZ',
    'GUEST',
  )
  @Get(':id/tags')
  async getTags(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserDto,
  ) {
    return this.boardsService.getTags(id, user);
  }

  @Post(':boardId/tags')
  create(
    @Param('boardId', ParseIntPipe) boardId: number,
    @Body() dto: CreateBoardTagDto,
  ) {
    return this.boardsService.createTag(boardId, dto);
  }

  @Get(':boardId/columns')
  async getColumns(
    @CurrentUser() user: UserDto,
    @Param('boardId', ParseIntPipe) boardId: number,
  ) {
    await this.boardsService.ensureBoard(boardId);
    return await this.boardsService.getColumns(boardId, user);
  }

  @Roles(
    'ADMIN',
    'G',
    'KD',
    'DO',
    'ROD',
    'DP',
    'ROV',
    'ROP',
    'MOP',
    'MOV',
    'DIZ',
    'LOGIST',
  )
  @Get(':id')
  async getBoardById(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.boardsService.getById(user.id, id);
  }

  /** Список участников доски (id, fullName, role) */
  @Get(':boardId/members')
  listMembers(@Param('boardId', ParseIntPipe) boardId: number) {
    return this.boardsService.listMembers(boardId);
  }

  /** Добавить пользователя на доску */
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'ROP', 'LOGIST')
  @Post('users/:userId')
  addUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: BoardIdDto,
  ) {
    return this.boardsService.addUserToBoard(body.boardId, userId);
  }

  /** Удалить пользователя с доски */
  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'ROP', 'LOGIST')
  @Delete('users/:userId')
  removeUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: BoardIdDto, // axios.delete(..., { data: { boardId } })
  ) {
    return this.boardsService.removeUserFromBoard(body.boardId, userId);
  }
}
