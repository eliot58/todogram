import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { FollowService } from './follow.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FollowController {
  constructor(private readonly service: FollowService) {}

  @Post(':id/follow')
  follow(@Req() req: RequestWithAuth, @Param('id') id: number) {
    return this.service.follow(req.userId, id);
  }

  @Post(':id/unfollow')
  unfollow(@Req() req: RequestWithAuth, @Param('id') id: number) {
    return this.service.unfollow(req.userId, id);
  }
}
