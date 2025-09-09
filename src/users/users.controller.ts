import { BadRequestException, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestWithAuth } from '../auth/auth.types';
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
import { isImage } from '../helper/mime';

@Controller('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get('me')
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
                    if (!isImage(file.mimetype)) {
                        throw new BadRequestException('Avatar must be PNG or JPEG');
                    }

                    const MAX = 5 * 1024 * 1024;
                    if (file.buffer.length > MAX) throw new BadRequestException('Avatar file is too large (max 5MB)');

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

    @Post(':id/follow')
    async follow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.follow(request.userId, id);
    }

    @Post(':id/unfollow')
    async unfollow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.unfollow(request.userId, id);
    }

    @Get('followers')
    @ApiQuery({
        name: 'cursor',
        required: false,
        type: Number,
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
    })
    async getFollowers(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getFollowers(request.userId, cursor, limit);
    }

    @Get('following')
    @ApiQuery({
        name: 'cursor',
        required: false,
        type: Number,
    })
    @ApiQuery({
        name: 'limit',
        required: false,
        type: Number,
    })
    async getFollowing(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getFollowing(request.userId, cursor, limit);
    }

    @Get('me/posts')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyPosts(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getUserPublications(request.userId, request.userId, {
            isReels: false,
            cursor,
            limit,
        });
    }

    @Get('me/reels')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyReels(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getUserPublications(request.userId, request.userId, {
            isReels: true,
            cursor,
            limit,
        });
    }

    @Get(':id/posts')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getUserPosts(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getUserPublications(request.userId, id, {
            isReels: false,
            cursor,
            limit,
        });
    }

    @Get(':id/reels')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getUserReels(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getUserPublications(request.userId, id, {
            isReels: true,
            cursor,
            limit,
        });
    }

    @Get('feed')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getFollowedPosts(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getFollowedPublications(request.userId, {
            cursor,
            limit,
        });
    }

    @Get('search')
    @ApiQuery({ name: 'q', required: true, type: String })
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async searchUsers(
        @Req() request: RequestWithAuth,
        @Query('q') q: string,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.searchUsers(request.userId, q, cursor, limit);
    }

    @Get(':id')
    async getUserById(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
    ) {
        return this.usersService.getUserPublicProfile(request.userId, id);
    }

    @Get(':id/followers')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getUserFollowersById(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getFollowersOfUser(request.userId, id, cursor, limit);
    }

    @Get(':id/following')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getUserFollowingById(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getFollowingOfUser(request.userId, id, cursor, limit);
    }

    @Get('check-username')
    @UseGuards()
    @ApiQuery({ name: 'username', required: true, type: String })
    async checkUsername(@Query('username') username: string) {
        const available = await this.usersService.isUsernameAvailable(username);
        return { available };
    }
}
