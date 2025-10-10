import { BadRequestException, Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { BlockedService } from './blocked.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BlockedController {
  constructor(private readonly service: BlockedService) {}

  @Post(':id')
  add(@Req() req: RequestWithAuth, @Param('id') id: number) {
    if (req.userId === id) throw new BadRequestException('Нельзя заблокировать самого себя');
    return this.service.blockUser(req.userId, id);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithAuth, @Param('id') id: number) {
    return this.service.unblockUser(req.userId, id);
  }
}
