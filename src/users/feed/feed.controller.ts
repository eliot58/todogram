import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { FeedService } from './feed.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FeedController {
  constructor(private readonly service: FeedService) {}

  @Get()
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getFollowedPosts(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getFollowedPublications(req.userId, { cursor, limit });
  }
}
