import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { isImage, isVideo } from '../helper/mime';

type ImageFile = { buffer: Buffer; filename: string; mimetype: string };
type VideoFile = { buffer: Buffer; filename: string; mimetype: string };

@Injectable()
export class PostsService {
    constructor(private prisma: PrismaService, private s3: S3Service) { }

    private assertPayload(
        input: { isReels: boolean },
        files: { images: ImageFile[]; video: VideoFile | null }
    ) {
        if (input.isReels) {
            if (!files.video) throw new BadRequestException('video is required for reels');
            if (files.images.length > 0) throw new BadRequestException('images are not allowed for reels');
            if (!isVideo(files.video.mimetype)) throw new BadRequestException('Invalid video mime type');
        } else {
            if (files.images.length === 0) throw new BadRequestException('At least one image is required');
            if (files.video) throw new BadRequestException('video is not allowed for non-reels post');
            for (const img of files.images) {
                if (!isImage(img.mimetype)) throw new BadRequestException(`Invalid image mime type: ${img.mimetype}`);
            }
        }
    }

    async create(
        data: { caption?: string; isReels: boolean; userId: number },
        files: { images: ImageFile[]; video: VideoFile | null }
    ) {
        this.assertPayload(data, files);

        if (data.isReels) {
            const videoUrl = await this.s3.uploadBuffer(files.video!.buffer, files.video!.mimetype, 'posts/videos');

            const post = await this.prisma.post.create({
                data: {
                    caption: data.caption,
                    isReels: true,
                    videoUrl,
                    userId: data.userId,
                },
                include: {
                    images: true,
                    user: { select: { id: true, username: true, avatarUrl: true } },
                    _count: { select: { likes: true, comments: true, savedBy: true } },
                },
            });

            return post;
        } else {
            const uploaded = await Promise.all(
                files.images.map((img, idx) =>
                    this.s3.uploadBuffer(img.buffer, img.mimetype, 'posts/images').then((url) => ({
                        url,
                        position: idx,
                    }))
                )
            );

            const post = await this.prisma.post.create({
                data: {
                    caption: data.caption,
                    isReels: false,
                    userId: data.userId,
                    images: {
                        create: uploaded.map((u) => ({ url: u.url, position: u.position })),
                    },
                },
                include: {
                    images: { orderBy: { position: 'asc' } },
                    user: { select: { id: true, username: true, avatarUrl: true } },
                    _count: { select: { likes: true, comments: true, savedBy: true } },
                },
            });

            return post;
        }
    }

    async findAll() {
        return this.prisma.post.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                images: { orderBy: { position: 'asc' } },
                user: { select: { id: true, username: true, avatarUrl: true, fullName: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });
    }

    async delete(userId: number, id: number) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            select: { userId: true },
        });

        if (!post) throw new ForbiddenException('Post not found');
        if (post.userId !== userId) throw new ForbiddenException('You are not allowed to delete this post');

        await this.prisma.post.delete({ where: { id } });
        return { message: 'Deleted' };
    }

    async findFeed(userId: number, limit: number, page: number) {
        const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
        const safePage = Math.max(page || 1, 1);

        const following = await this.prisma.follower.findMany({
            where: { followerId: userId },
            select: { followingId: true },
        });

        const authorIds = following.map(f => f.followingId);

        if (authorIds.length === 0) {
            return { items: [], hasMore: false, page: safePage, limit: safeLimit };
        }

        const where = { userId: { in: authorIds } };
        const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
        const skip = (safePage - 1) * safeLimit;
        const takePlusOne = safeLimit + 1;

        const posts = await this.prisma.post.findMany({
            where,
            orderBy,
            skip,
            take: takePlusOne,
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                images: { orderBy: { position: 'asc' }, select: { id: true, url: true, position: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });

        const hasMore = posts.length > safeLimit;
        const items = posts.slice(0, safeLimit);

        return { items, hasMore, page: safePage, limit: safeLimit };
    }

    async addComment(userId: number, postId: number, content: string, parentId?: number) {
        const text = (content ?? '').trim();
        if (!text) throw new BadRequestException('Content is required');
        if (text.length > 1000) throw new BadRequestException('Content is too long (max 1000)');

        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        if (parentId) {
            const parent = await this.prisma.comment.findUnique({
                where: { id: parentId },
                select: { id: true, postId: true },
            });
            if (!parent || parent.postId !== postId) throw new BadRequestException('Invalid parentId');
        }

        const comment = await this.prisma.comment.create({
            data: { content: text, userId, postId, parentId: parentId ?? null },
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, replies: true } },
            },
        });

        return comment;
    }

    async getComments(requesterId: number, postId: number, page: number, limit: number) {
        const safePage = Math.max(page || 1, 1);
        const safeLimit = Math.min(Math.max(limit || 20, 1), 100);
        const skip = (safePage - 1) * safeLimit;
        const takePlusOne = safeLimit + 1;

        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        // Топ-уровень (parentId = null). Если нужны все — убери фильтр parentId.
        const rows = await this.prisma.comment.findMany({
            where: { postId, parentId: null },
            orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
            skip,
            take: takePlusOne,
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, replies: true } },
            },
        });

        const hasMore = rows.length > safeLimit;
        const items = rows.slice(0, safeLimit);

        return { items, hasMore, page: safePage, limit: safeLimit };
    }

    // ===== LIKES =====
    async likePost(userId: number, postId: number) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        // upsert по уникальному композитному ключу (userId, postId)
        await this.prisma.like.upsert({
            where: { userId_postId: { userId, postId } },
            create: { userId, postId },
            update: {},
        });

        const likesCount = await this.prisma.like.count({ where: { postId } });
        return { liked: true, likesCount };
    }

    async unlikePost(userId: number, postId: number) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        await this.prisma.like
            .delete({ where: { userId_postId: { userId, postId } } })
            .catch(() => void 0);

        const likesCount = await this.prisma.like.count({ where: { postId } });
        return { liked: false, likesCount };
    }

    // ===== SAVES =====
    async savePost(userId: number, postId: number) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        await this.prisma.savedPost.upsert({
            where: { userId_postId: { userId, postId } },
            create: { userId, postId },
            update: {},
        });

        const savedCount = await this.prisma.savedPost.count({ where: { postId } });
        return { saved: true, savedCount };
    }

    async unsavePost(userId: number, postId: number) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        await this.prisma.savedPost
            .delete({ where: { userId_postId: { userId, postId } } })
            .catch(() => void 0);

        const savedCount = await this.prisma.savedPost.count({ where: { postId } });
        return { saved: false, savedCount };
    }
}
