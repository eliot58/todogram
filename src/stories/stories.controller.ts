import { BadRequestException, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { RequestWithAuth } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { isImage, isVideo } from '../helper/mime';
import { StoriesService } from './stories.service';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

@Controller('stories')
export class StoriesController {
    constructor(private readonly storiesService: StoriesService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                image: { type: 'string', format: 'binary' },
                video: { type: 'string', format: 'binary' },
            },
        },
    })
    async create(@Req() request: RequestWithAuth) {
        const parts = request.parts();

        let image: { buffer: Buffer; filename: string; mimetype: string } | null = null;
        let video: { buffer: Buffer; filename: string; mimetype: string } | null = null;
        let expiresInHours = 24;

        for await (const part of parts) {
            if (part.type === 'file') {
                const chunks: Buffer[] = [];
                for await (const chunk of part.file) chunks.push(chunk);
                const file = { buffer: Buffer.concat(chunks), filename: part.filename, mimetype: part.mimetype };

                if (part.fieldname === 'image') {
                    if (image || video) throw new BadRequestException('Provide exactly one file: image OR video');
                    if (!isImage(file.mimetype)) throw new BadRequestException('Image must be PNG or JPEG');
                    const MAX_IMG = 10 * 1024 * 1024;
                    if (file.buffer.length > MAX_IMG) throw new BadRequestException('Image is too large (max 10MB)');
                    image = file;
                } else if (part.fieldname === 'video') {
                    if (image || video) throw new BadRequestException('Provide exactly one file: image OR video');
                    if (!isVideo(file.mimetype)) throw new BadRequestException('Video must be MP4/QuickTime/WebM');
                    const MAX_VID = 100 * 1024 * 1024;
                    if (file.buffer.length > MAX_VID) throw new BadRequestException('Video is too large (max 100MB)');
                    video = file;
                } else {
                    throw new BadRequestException(`Unexpected file field: ${part.fieldname}`);
                }
            } else {
                if (part.fieldname === 'expiresInHours') {
                    const n = Number(part.value);
                    if (!Number.isFinite(n)) throw new BadRequestException('expiresInHours must be a number');
                    expiresInHours = Math.min(Math.max(Math.trunc(n), 1), 168);
                } else {
                }
            }
        }

        if (!image && !video) throw new BadRequestException('File is required: image OR video');

        const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

        return this.storiesService.create({
            userId: request.userId,
            file: image ?? video!,
            kind: image ? 'image' as const : 'video' as const,
            expiresAt,
        });
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    async remove(@Req() request: RequestWithAuth, @Param('id') id: number) {
        return this.storiesService.delete(request.userId, id);
    }

    @Get('following/active')
    @UseGuards(JwtAuthGuard)
    async getFollowingActive(
      @Req() request: RequestWithAuth,
      @Query('page') page: number,
      @Query('limit') limit: number,
    ) {
      return this.storiesService.getFollowingActive(request.userId, page, limit);
    }
}
