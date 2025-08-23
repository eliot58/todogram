import { Controller, Delete, Get, Param, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { PostsService } from './posts.service';
import { RequestWithAuth } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

@Controller('posts')
export class PostsController {
    constructor(private postsService: PostsService) { }

    @Post()
    @ApiBearerAuth()
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
            },
        },
    })
    @UseGuards(JwtAuthGuard)
    async create(@Req() request: RequestWithAuth) {
        const parts = request.parts();

        const dto: Record<string, any> = {};
        const images: Array<{ buffer: Buffer; filename: string; mimetype: string }> = [];
        let video: { buffer: Buffer; filename: string; mimetype: string } | null = null;

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
            { images, video }
        );
    }

    @Get()
    @UseGuards(JwtAuthGuard)
    async getAll() {
        return this.postsService.findAll();
    }

    @Delete(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    async remove(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.postsService.delete(request.userId, id);
    }
}
