import { BadRequestException, Body, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RequestWithAuth } from '../../auth/auth.types';
import { isImage } from '../../helper/mime';
import { ProfileService } from './profile.service';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ProfileController {
  constructor(private readonly service: ProfileService) {}

  @Get()
  getMe(@Req() req: RequestWithAuth) {
    return this.service.getUserById(req.userId);
  }

  @Patch()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string' },
        fullName: { type: 'string' },
        bio: { type: 'string' },
        email: { type: 'string' },
        avatar: { type: 'string', format: 'binary' },
      },
    },
  })
  async updateProfile(@Req() req: RequestWithAuth) {
    const parts = req.parts();
    const dto: Record<string, any> = {};
    let avatar: { buffer: Buffer; filename: string; mimetype: string } | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const file = { buffer: Buffer.concat(chunks), filename: part.filename, mimetype: part.mimetype };

        if (part.fieldname === 'avatar') {
          if (!isImage(file.mimetype)) throw new BadRequestException('Avatar must be PNG or JPEG');
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

    return this.service.updateProfile(req.userId, dto, avatar);
  }

  @Patch('privacy/toggle')
  togglePrivacy(@Req() req: RequestWithAuth) {
    return this.service.togglePrivacy(req.userId);
  }

  @Patch('notify/toggle')
  toggleNotify(@Req() req: RequestWithAuth) {
    return this.service.toggleNotify(req.userId);
  }

  @Get('posts')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyPosts(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getUserPublications(req.userId, req.userId, { isReels: undefined, cursor, limit });
  }

  @Get('reels')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyReels(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getUserPublications(req.userId, req.userId, { isReels: true, cursor, limit });
  }

  @Get('close-friends')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyCloseFriends(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getMyCloseFriends(req.userId, cursor, limit);
  }

  @Get('blocked')
  @ApiQuery({ name: 'cursor', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyBlocked(@Req() req: RequestWithAuth, @Query('cursor') cursor?: number, @Query('limit') limit = 20) {
    return this.service.getMyBlocked(req.userId, cursor, limit);
  }
}
