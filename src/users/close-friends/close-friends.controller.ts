import { Body, Controller, Delete, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { CloseFriendsService } from './close-friends.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CloseFriendsController {
  constructor(private readonly service: CloseFriendsService) {}

  @Post()
  @ApiBody({ schema: { properties: { ids: { type: 'array', items: { type: 'number' } } } } })
  addMany(@Req() req: RequestWithAuth, @Body() body: { ids: number[] }) {
    return this.service.addManyToCloseFriends(req.userId, body.ids);
  }

  @Delete()
  removeMany(@Req() req: RequestWithAuth, @Body() body: { ids: number[] }) {
    return this.service.removeManyFromCloseFriends(req.userId, body.ids);
  }
}
