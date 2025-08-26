import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    PrismaModule,
    S3Module
  ],
  controllers: [StoriesController],
  providers: [StoriesService]
})
export class StoriesModule {}
