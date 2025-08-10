import { Test, TestingModule } from '@nestjs/testing';
import { KanbanFilesController } from './kanban-files.controller';

describe('KanbanFilesController', () => {
  let controller: KanbanFilesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KanbanFilesController],
    }).compile();

    controller = module.get<KanbanFilesController>(KanbanFilesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
