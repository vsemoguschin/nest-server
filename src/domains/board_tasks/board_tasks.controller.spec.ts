import { Test, TestingModule } from '@nestjs/testing';
import { BoardTasksController } from './board_tasks.controller';

describe('BoardTasksController', () => {
  let controller: BoardTasksController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoardTasksController],
    }).compile();

    controller = module.get<BoardTasksController>(BoardTasksController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
