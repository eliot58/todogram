import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { PublicService } from './public.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class PublicController {
  constructor(private readonly service: PublicService) {}

  @Get(':id')
  getUserById(@Req() req: RequestWithAuth, @Param('id') id: number) {
    return this.service.getUserPublicProfile(req.userId, id);
  }

  @Get(':id/posts')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserPosts(@Req() req: RequestWithAuth, @Param('id') id: number, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getUserPublications(req.userId, id, { isReels: undefined, cursor, limit });
  }

  @Get(':id/reels')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserReels(@Req() req: RequestWithAuth, @Param('id') id: number, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getUserPublications(req.userId, id, { isReels: true, cursor, limit });
  }

  @Get(':id/followers')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserFollowers(@Req() req: RequestWithAuth, @Param('id') id: number, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getFollowersOfUser(req.userId, id, cursor, limit);
  }

  @Get(':id/following')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserFollowing(@Req() req: RequestWithAuth, @Param('id') id: number, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getFollowingOfUser(req.userId, id, cursor, limit);
  }
}
