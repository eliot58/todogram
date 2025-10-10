import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { RelationsService } from './relations.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class RelationsController {
  constructor(private readonly service: RelationsService) { }

  @Get('followers')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getFollowers(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getFollowers(req.userId, cursor, limit);
  }

  @Get('following')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getFollowing(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getFollowing(req.userId, cursor, limit);
  }
}
