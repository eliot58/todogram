import { Module } from '@nestjs/common';
import { CloseFriendsController } from './close-friends.controller';
import { CloseFriendsService } from './close-friends.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [CloseFriendsController],
    providers: [CloseFriendsService],
    exports: [CloseFriendsService],
})
export class CloseFriendsModule { }
