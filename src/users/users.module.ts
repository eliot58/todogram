import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';

@Module({
  imports: [
    PrismaModule,
    S3Module
  ],
  providers: [UsersService],
  controllers: [UsersController]
})
export class UsersModule {}
