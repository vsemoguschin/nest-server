import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDto } from 'src/domains/users/dto/user.dto';
import { TaskAuditService } from 'src/services/boards/task-audit.service';
import { UpdateCommentDto } from './dto/update-comment.dto';
// (опционально) Swagger:
// import { ApiNoContentResponse, ApiParam, ApiTags } from '@nestjs/swagger';

// @ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(
    private readonly commentsService: CommentsService,
    private readonly audit: TaskAuditService,
  ) {}

  @Patch(':id')
  async update(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCommentDto,
  ) {
    const comment = await this.commentsService.updateCommentText(
      id,
      user.id,
      dto.text,
    );
    await this.audit.log({
      userId: user.id,
      description: `Изменил комментарий: "${dto.text}" на "${comment.text}"`,

      taskId: comment.taskId,
      action: 'UPDATE_COMMENT',
    });

    return {
      id: comment.id,
      text: comment.text,
      updatedAt: comment.updatedAt,
    };
  }

  // DELETE /comments/:id — удалить комментарий
  // 204 No Content при успехе
  // (в сервисе: soft-delete самого комментария, удалить taskLinks, пометить связанные файлы deletedAt и отвязать commentId)
  // (жёсткое удаление с Я.Диска вынесем в отдельный сервис — добавлю после вашего "ГОТОВО")
  @Delete(':id')
  @HttpCode(204)
  // @ApiParam({ name: 'id', type: Number })
  // @ApiNoContentResponse({ description: 'Комментарий удалён' })
  async remove(
    @CurrentUser() user: UserDto,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    const comment = await this.commentsService.deleteComment(id);
    if (comment.files.length) {
      await this.audit.log({
        userId: user.id,
        description:
          'Удалил вложения: ' + comment.files.map((f) => f.name).join(','),

        taskId: comment.taskId,
        action: 'DEL_ATTACHMENTS',
      });
    }
  }
}
