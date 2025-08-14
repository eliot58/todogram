import { Test, TestingModule } from '@nestjs/testing';
import { ReelsService } from './reels.service';

describe('ReelsService', () => {
  let service: ReelsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReelsService],
    }).compile();

    service = module.get<ReelsService>(ReelsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
