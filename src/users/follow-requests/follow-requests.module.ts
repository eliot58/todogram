import { Module } from '@nestjs/common';
import { FollowRequestsController } from './follow-requests.controller';
import { FollowRequestsService } from './follow-requests.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [FollowRequestsController],
    providers: [FollowRequestsService],
    exports: [FollowRequestsService],
})
export class FollowRequestsModule { }
