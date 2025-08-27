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

    async getAllPosts(
        viewerId: number,
        { cursor, limit },
    ) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const posts = await this.prisma.post.findMany({
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: Number(cursor) } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                images: { orderBy: { position: 'asc' } },
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });

        const ids = posts.map(p => p.id);

        let likedSet = new Set<number>();
        let savedSet = new Set<number>();

        if (ids.length > 0) {
            const [likes, saved] = await Promise.all([
                this.prisma.like.findMany({
                    where: { userId: viewerId, postId: { in: ids } },
                    select: { postId: true },
                }),
                this.prisma.savedPost.findMany({
                    where: { userId: viewerId, postId: { in: ids } },
                    select: { postId: true },
                }),
            ]);

            const likeIds = likes.map(l => l.postId).filter((id): id is number => typeof id === 'number');
            const savedIds = saved.map(s => s.postId).filter((id): id is number => typeof id === 'number');

            likedSet = new Set(likeIds);
            savedSet = new Set(savedIds);
        }

        const items = posts.map(p => ({
            id: p.id,
            caption: p.caption,
            isReels: p.isReels,
            videoUrl: p.videoUrl,
            createdAt: p.createdAt,
            user: p.user,
            images: p.images,
            counts: {
                likes: p._count.likes,
                comments: p._count.comments,
                saved: p._count.savedBy,
            },
            liked: likedSet.has(p.id),
            saved: savedSet.has(p.id),
        }));

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor, hasMore };
    }

    async getAllReels(
        viewerId: number,
        { cursor, limit },
    ) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const posts = await this.prisma.post.findMany({
            where: { isReels: true },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: Number(cursor) } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                images: { orderBy: { position: 'asc' } },
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, comments: true, savedBy: true } },
            },
        });

        const ids = posts.map(p => p.id);

        let likedSet = new Set<number>();
        let savedSet = new Set<number>();

        if (ids.length > 0) {
            const [likes, saved] = await Promise.all([
                this.prisma.like.findMany({
                    where: { userId: viewerId, postId: { in: ids } },
                    select: { postId: true },
                }),
                this.prisma.savedPost.findMany({
                    where: { userId: viewerId, postId: { in: ids } },
                    select: { postId: true },
                }),
            ]);

            const likeIds = likes.map(l => l.postId).filter((id): id is number => typeof id === 'number');
            const savedIds = saved.map(s => s.postId).filter((id): id is number => typeof id === 'number');

            likedSet = new Set(likeIds);
            savedSet = new Set(savedIds);
        }

        const items = posts.map(p => ({
            id: p.id,
            caption: p.caption,
            isReels: p.isReels,
            videoUrl: p.videoUrl,
            createdAt: p.createdAt,
            user: p.user,
            images: p.images,
            counts: {
                likes: p._count.likes,
                comments: p._count.comments,
                saved: p._count.savedBy,
            },
            liked: likedSet.has(p.id),
            saved: savedSet.has(p.id),
        }));

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }

    // ===== COMMENTS =====
    async addComment(userId: number, postId: number, content: string) {
        const text = (content ?? '').trim();
        if (!text) throw new BadRequestException('Content is required');
        if (text.length > 1000) throw new BadRequestException('Content is too long (max 1000)');

        const post = await this.prisma.post.findUnique({
            where: { id: postId },
            select: { id: true },
        });
        if (!post) throw new NotFoundException('Post not found');

        const comment = await this.prisma.comment.create({
            data: {
                content: text,
                userId,
                postId,
                parentId: null
            },
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, replies: true } },
            },
        });

        return comment;
    }

    async getPostComments(viewerId: number, postId: number, { cursor, limit }) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const comments = await this.prisma.comment.findMany({
            where: { postId, parentId: null },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: Number(cursor) } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, replies: true } },
            },
        });

        const ids = comments.map(c => c.id);

        let likedSet = new Set<number>();
        if (ids.length) {
            const likes = await this.prisma.commentLike.findMany({
                where: { userId: viewerId, commentId: { in: ids } },
                select: { commentId: true },
            });
            const likeIds = likes
                .map(l => l.commentId)
                .filter((id): id is number => typeof id === 'number');

            likedSet = new Set<number>(likeIds);
        }

        const items = comments.map(c => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            user: c.user,
            counts: {
                likes: c._count.likes,
                replies: c._count.replies,
            },
            liked: likedSet.has(c.id),
        }));

        const hasMore = comments.length === take;
        const nextCursor = hasMore ? comments[comments.length - 1].id : null;

        return { items, nextCursor };
    }

    async getCommentReplies(viewerId: number, commentId: number, { cursor, limit }) {
        const parent = await this.prisma.comment.findUnique({
            where: { id: commentId },
            select: { id: true },
        });
        if (!parent) throw new NotFoundException('Comment not found');

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const replies = await this.prisma.comment.findMany({
            where: { parentId: commentId },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: Number(cursor) } : undefined,
            skip: cursor ? 1 : 0,
            take,
            include: {
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                _count: { select: { likes: true, replies: true } },
            },
        });

        const ids = replies.map(r => r.id);

        let likedSet = new Set<number>();
        if (ids.length) {
            const likes = await this.prisma.commentLike.findMany({
                where: { userId: viewerId, commentId: { in: ids } },
                select: { commentId: true },
            });
            const likeIds = likes
                .map(l => l.commentId)
                .filter((id): id is number => typeof id === 'number');

            likedSet = new Set<number>(likeIds);
        }

        const items = replies.map(r => ({
            id: r.id,
            content: r.content,
            createdAt: r.createdAt,
            user: r.user,
            counts: {
                likes: r._count.likes,
                replies: r._count.replies,
            },
            liked: likedSet.has(r.id),
        }));

        const hasMore = replies.length === take;
        const nextCursor = hasMore ? replies[replies.length - 1].id : null;

        return { items, nextCursor };
    }

    // ===== LIKES =====
    async likePost(userId: number, postId: number) {
        const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');

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
