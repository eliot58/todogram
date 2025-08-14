import { Test, TestingModule } from '@nestjs/testing';
import { ReelsController } from './reels.controller';

describe('ReelsController', () => {
  let controller: ReelsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReelsController],
    }).compile();

    controller = module.get<ReelsController>(ReelsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
