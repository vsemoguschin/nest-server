import {
  Body,
  Controller,
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

@ApiTags('Boards')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get(':id/kanban')
  async getKanban(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.boardsService.getKanban(user.id, id);
  }

  @Roles('ADMIN', 'G', 'KD')
  @Post()
  async createBoard(@CurrentUser() user: UserDto, @Body() dto: CreateBoardDto) {
    return this.boardsService.create(user.id, dto);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get()
  async listBoards(@CurrentUser() user: UserDto) {
    return this.boardsService.listForUser(user.id);
  }

  @Roles('ADMIN', 'G', 'KD', 'DO', 'ROD', 'DP', 'ROV')
  @Get(':id')
  async getBoardById(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.boardsService.getById(user.id, id);
  }
}
