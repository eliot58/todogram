import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { FollowRequestsService } from './follow-requests.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class FollowRequestsController {
  constructor(private readonly service: FollowRequestsService) {}

  @Delete(':targetId/cancel')
  cancel(@Req() req: RequestWithAuth, @Param('targetId') targetId: number) {
    return this.service.cancelFollowRequest(req.userId, targetId);
  }

  @Post(':requesterId/accept')
  accept(@Req() req: RequestWithAuth, @Param('requesterId') requesterId: number) {
    return this.service.acceptFollowRequest(req.userId, requesterId);
  }

  @Post(':requesterId/reject')
  reject(@Req() req: RequestWithAuth, @Param('requesterId') requesterId: number) {
    return this.service.rejectFollowRequest(req.userId, requesterId);
  }

  @Get('incoming')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  incoming(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.listIncomingFollowRequests(req.userId, cursor, limit);
  }

  @Get('outgoing')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  outgoing(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.listOutgoingFollowRequests(req.userId, cursor, limit);
  }
}
