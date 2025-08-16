import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
                image: { type: 'string', format: 'binary' },
            },
            required: ['image'],
        },
    })
    @UseGuards(JwtAuthGuard)
    async create(@Req() request: RequestWithAuth) {
        const parts = request.parts();
        const dto: Record<string, any> = {};
        let fileBuffer: Buffer | null = null;
        let filename = '';
        let mimetype = '';

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = [];
                for await (const chunk of part.file) {
                    chunks.push(chunk);
                }
                fileBuffer = Buffer.concat(chunks);
                filename = part.filename;
                mimetype = part.mimetype;
            } else {
                dto[part.fieldname] = part.value;
            }
        }

        if (!fileBuffer) {
            throw new Error('Image file is required');
        }

        return this.postsService.create(
            {
                caption: dto.caption,
                userId: request.userId,
            },
            {
                buffer: fileBuffer,
                filename,
                mimetype,
            },
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
