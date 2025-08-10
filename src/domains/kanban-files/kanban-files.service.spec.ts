import { Test, TestingModule } from '@nestjs/testing';
import { KanbanFilesService } from './kanban-files.service';

describe('KanbanFilesService', () => {
  let service: KanbanFilesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [KanbanFilesService],
    }).compile();

    service = module.get<KanbanFilesService>(KanbanFilesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
