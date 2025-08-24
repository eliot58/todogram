import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithAuth } from '../auth/auth.types';
import { ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

@Controller('users')
@ApiBearerAuth()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    async getMe(@Req() request: RequestWithAuth) {
        return this.usersService.getUserById(request.userId);
    }

    @Patch('me')
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                username: { type: 'string' },
                fullName: { type: 'string' },
                bio: { type: 'string' },
                email: { type: 'string' },
                avatar: { type: 'string', format: 'binary' }
            },
        },
    })
    @UseGuards(JwtAuthGuard)
    async updateProfile(@Req() request: RequestWithAuth) {
        const parts = request.parts();

        const dto: Record<string, any> = {};
        let avatar: { buffer: Buffer; filename: string; mimetype: string } | null = null;

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = [];
                for await (const chunk of part.file) chunks.push(chunk);
                const file = { buffer: Buffer.concat(chunks), filename: part.filename, mimetype: part.mimetype };

                if (part.fieldname === 'avatar') {
                    avatar = file;
                } else {
                    throw new BadRequestException(`Unexpected file field: ${part.fieldname}`);
                }
            } else {
                dto[part.fieldname] = part.value;
            }
        }

        return this.usersService.updateProfile(request.userId, dto, avatar);
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
    @UseGuards(JwtAuthGuard)
    async follow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.follow(request.userId, id);
    }

    @Post(':id/unfollow')
    @UseGuards(JwtAuthGuard)
    async unfollow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.unfollow(request.userId, id);
    }
}
