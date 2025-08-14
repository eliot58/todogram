import { Module } from '@nestjs/common';
import { ReelsService } from './reels.service';
import { ReelsController } from './reels.controller';

@Module({
  providers: [ReelsService],
  controllers: [ReelsController]
})
export class ReelsModule {}
