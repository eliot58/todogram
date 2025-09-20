import { Controller, Delete, Get, Param, Post, Req, UseGuards, BadRequestException, Query, Body } from '@nestjs/common';
import { PostsService } from './posts.service';
import { RequestWithAuth } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';

@Controller('posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class PostsController {
    constructor(private postsService: PostsService) { }

    @Post()
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                caption: { type: 'string' },
                isReels: { type: 'boolean', default: false },
                images: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                },
                video: { type: 'string', format: 'binary' },
                thumbnail: { type: 'string', format: 'binary' },
            },
        },
    })
    async create(@Req() request: RequestWithAuth) {
        const parts = request.parts();

        const dto: Record<string, any> = {};
        const images: Array<{ buffer: Buffer; filename: string; mimetype: string }> = [];
        let video: { buffer: Buffer; filename: string; mimetype: string } | null = null;
        let thumbnail: { buffer: Buffer; filename: string; mimetype: string } | null = null;

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = [];
                for await (const chunk of part.file) chunks.push(chunk);
                const file = { buffer: Buffer.concat(chunks), filename: part.filename, mimetype: part.mimetype };

                if (part.fieldname === 'images') {
                    images.push(file);
                } else if (part.fieldname === 'video') {
                    if (video) throw new BadRequestException('Only one video file is allowed');
                    video = file;
                } else if (part.fieldname === 'thumbnail') {
                    if (thumbnail) throw new BadRequestException('Only one thumbnail file is allowed');
                    thumbnail = file;
                } else {
                    throw new BadRequestException(`Unexpected file field: ${part.fieldname}`);
                }
            } else {
                dto[part.fieldname] = part.value;
            }
        }

        const isReels =
            typeof dto.isReels === 'boolean'
                ? dto.isReels
                : typeof dto.isReels === 'string'
                    ? dto.isReels.toLowerCase() === 'true'
                    : false;

        return this.postsService.create(
            {
                caption: dto.caption,
                isReels,
                userId: request.userId,
            },
            { images, video, thumbnail }
        );
    }

    @Delete(':id')
    async remove(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.postsService.delete(request.userId, id);
    }

    @Get()
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getAllPosts(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.postsService.getAllPosts(request.userId, { cursor, limit, isReels: false });
    }

    @Get('reels')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getAllReels(
        @Req() request: RequestWithAuth,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.postsService.getAllPosts(request.userId, { cursor, limit, isReels: true });
    }

    // ---------- COMMENTS ----------
    @Post(':id/comments')
    @ApiConsumes('application/json')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['content'],
            properties: {
                content: { type: 'string', minLength: 1, maxLength: 1000 }
            },
        },
    })
    async addComment(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
        @Body() body: { content: string; },
    ) {
        return this.postsService.addComment(request.userId, id, body.content);
    }

    @Post('comments/:commentId/replies')
    @ApiConsumes('application/json')
    @ApiBody({
        schema: {
            type: 'object',
            required: ['content'],
            properties: {
                content: { type: 'string', minLength: 1, maxLength: 1000 }
            },
        },
    })
    async addReply(
        @Req() request: RequestWithAuth,
        @Param('commentId') commentId: number,
        @Body() body: { content: string }
    ) {
        return this.postsService.addReply(request.userId, commentId, body.content);
    }

    @Get(':id/comments')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getPostComments(
        @Req() request: RequestWithAuth,
        @Param('id') id: number,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.postsService.getPostComments(request.userId, id, { cursor, limit });
    }

    @Get('comments/:commentId/replies')
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async getCommentReplies(
        @Req() request: RequestWithAuth,
        @Param('commentId') commentId: number,
        @Query('cursor') cursor?: number,
        @Query('limit') limit: number = 20,
    ) {
        return this.postsService.getCommentReplies(request.userId, commentId, { cursor, limit });
    }

    @Post('comments/:commentId/like')
    async likeComment(
        @Req() request: RequestWithAuth,
        @Param('commentId') commentId: number
    ) {
        return this.postsService.likeComment(request.userId, Number(commentId));
    }

    @Delete('comments/:commentId/like')
    async unlikeComment(
        @Req() request: RequestWithAuth,
        @Param('commentId') commentId: number
    ) {
        return this.postsService.unlikeComment(request.userId, Number(commentId));
    }

    // ---------- LIKES ----------
    @Post(':id/like')
    async like(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.postsService.likePost(request.userId, id);
    }

    @Delete(':id/like')
    async unlike(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.postsService.unlikePost(request.userId, id);
    }

    // ---------- SAVES ----------
    @Post(':id/save')
    async save(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.postsService.savePost(request.userId, id);
    }

    @Delete(':id/save')
    async unsave(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.postsService.unsavePost(request.userId, id);
    }
}
