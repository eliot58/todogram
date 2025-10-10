import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { SearchService } from './search.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @ApiQuery({ name: 'q', required: true, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(@Req() req: RequestWithAuth, @Query('q') q: string, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.searchUsers(req.userId, q, cursor, limit);
  }
}
