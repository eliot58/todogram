import { Module } from '@nestjs/common';
import { RelationsController } from './relations.controller';
import { RelationsService } from './relations.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [RelationsController],
    providers: [RelationsService],
    exports: [RelationsService],
})
export class RelationsModule { }
