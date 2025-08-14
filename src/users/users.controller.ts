import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithAuth } from '../auth/auth.types';
import { UpdateProfileDto } from './user.dto';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getMe(@Req() request: RequestWithAuth) {
        return this.usersService.getUserById(request.userId);
    }

    @Patch('me')
    @UseGuards(JwtAuthGuard)
    async updateProfile(@Req() request: RequestWithAuth, @Body() dto: UpdateProfileDto) {
        return this.usersService.updateProfile(request.userId, dto);
    }

    @Get('followers')
    @UseGuards(JwtAuthGuard)
    async getFollowers(
        @Req() request: RequestWithAuth,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10
    ) {
        return this.usersService.getFollowers(request.userId, page, limit);
    }

    @Get('following')
    @UseGuards(JwtAuthGuard)
    async getFollowing(
        @Req() request: RequestWithAuth,
        @Query('page') page: number = 1,
        @Query('limit') limit: number = 10
    ) {
        return this.usersService.getFollowing(request.userId, page, limit);
    }

    @Post(':id/follow')
    async follow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.follow(request.userId, id);
    }

    @Post(':id/unfollow')
    async unfollow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.unfollow(request.userId, id);
    }
}
