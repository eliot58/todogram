import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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

    @Patch('me/privacy/toggle')
    async togglePrivacy(@Req() request: RequestWithAuth) {
        return this.usersService.togglePrivacy(request.userId);
    }

    @Patch('me/notify/toggle')
    async toggleNotify(@Req() request: RequestWithAuth) {
        return this.usersService.toggleNotify(request.userId);
    }

    @Post(':id/follow')
    async follow(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.usersService.follow(request.userId, id);
    }

    @Delete('follow-requests/:targetId/cancel')
    async cancelFollowRequest(@Req() req: RequestWithAuth, @Param('targetId') targetId: number) {
        return this.usersService.cancelFollowRequest(req.userId, targetId);
    }

    @Post('follow-requests/:requesterId/accept')
    async acceptFollowRequest(@Req() req: RequestWithAuth, @Param('requesterId') requesterId: number) {
        return this.usersService.acceptFollowRequest(req.userId, requesterId);
    }

    @Post('follow-requests/:requesterId/reject')
    async rejectFollowRequest(@Req() req: RequestWithAuth, @Param('requesterId') requesterId: number) {
        return this.usersService.rejectFollowRequest(req.userId, requesterId);
    }

    @Get('follow-requests/incoming')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async listIncoming(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit: number = 20) {
        return this.usersService.listIncomingFollowRequests(req.userId, cursor, limit);
    }

    @Get('follow-requests/outgoing')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async listOutgoing(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit: number = 20) {
        return this.usersService.listOutgoingFollowRequests(req.userId, cursor, limit);
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
            isReels: undefined,
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
            isReels: undefined,
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

    @Post('close-friends')
    @ApiBody({ schema: { properties: { ids: { type: 'array', items: { type: 'number' } } } } })
    async addManyToCloseFriends(
        @Req() request: RequestWithAuth,
        @Body() body: { ids: number[] },
    ) {
        return this.usersService.addManyToCloseFriends(request.userId, body.ids);
    }
    
    @Delete('close-friends')
    async removeManyFromCloseFriends(
        @Req() request: RequestWithAuth,
        @Body() body: { ids: number[] },
    ) {
        return this.usersService.removeManyFromCloseFriends(request.userId, body.ids);
    }

    @Get('me/close-friends')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyCloseFriends(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getMyCloseFriends(request.userId, cursor, limit);
    }

    @Post('blocked/:id')
    async addToBlocked(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
    ) {
        if (request.userId === id) {
            throw new BadRequestException('Нельзя заблокировать самого себя');
        }
        return this.usersService.blockUser(request.userId, id);
    }

    @Delete('blocked/:id')
    async removeFromBlocked(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
    ) {
        return this.usersService.unblockUser(request.userId, id);
    }

    @Get('me/blocked')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getMyBlocked(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.usersService.getMyBlocked(request.userId, cursor, limit);
    }
}
