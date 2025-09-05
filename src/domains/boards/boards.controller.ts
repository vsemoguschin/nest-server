import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
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

@ApiTags('Boards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  /** Список всех активных пользователей (для добавления) */
  @Get('users')
  listAllUsers() {
    return this.boardsService.listAllUsers();
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ','ASSISTANT')
  @Get(':id/kanban')
  async getKanban(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) boardId: number,
    @Query('hidden') hidden?: string, // CSV: "1,2,3"
  ) {
    const hiddenIds =
      (hidden ?? '')
        .split(',')
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n)) || [];

    return this.boardsService.getKanban(user, boardId, hiddenIds);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO')
  @Post()
  async createBoard(@CurrentUser() user: UserDto, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(user.id, dto);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ')
  @Get()
  async listBoards(@CurrentUser() user: UserDto) {
    return this.boardsService.listForUser(user);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ','ASSISTANT')
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
    this.boardsService.ensureBoard(boardId);
    return await this.boardsService.getColumns(boardId);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV', 'MOP', 'MOV', 'DIZ')
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
  @Post('users/:userId')
  addUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: BoardIdDto,
  ) {
    return this.boardsService.addUserToBoard(body.boardId, userId);
  }

  /** Удалить пользователя с доски */
  @Delete('users/:userId')
  removeUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: BoardIdDto, // axios.delete(..., { data: { boardId } })
  ) {
    return this.boardsService.removeUserFromBoard(body.boardId, userId);
  }
}
