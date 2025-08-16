import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    PrismaModule,
    S3Module
  ],
  providers: [PostsService],
  controllers: [PostsController]
})
export class PostsModule {}
