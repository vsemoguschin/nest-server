import { Test, TestingModule } from '@nestjs/testing';
import { BoardTasksService } from './board_tasks.service';

describe('BoardTasksService', () => {
  let service: BoardTasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BoardTasksService],
    }).compile();

    service = module.get<BoardTasksService>(BoardTasksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
