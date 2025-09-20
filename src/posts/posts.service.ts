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
        files: { images: ImageFile[]; video: VideoFile | null; thumbnail: ImageFile | null }
    ) {
        if (input.isReels) {
            if (!files.video) throw new BadRequestException('video is required for reels');
            if (files.images.length > 0) throw new BadRequestException('images are not allowed for reels');
            if (!isVideo(files.video.mimetype)) throw new BadRequestException('Invalid video mime type');

            if (!files.thumbnail) throw new BadRequestException('thumbnail is required for reels');
            if (!isImage(files.thumbnail.mimetype)) throw new BadRequestException(`Invalid thumbnail mime type: ${files.thumbnail.mimetype}`);
        } else {
            if (files.images.length === 0) throw new BadRequestException('At least one image is required');
            if (files.video) throw new BadRequestException('video is not allowed for non-reels post');
            if (files.thumbnail) throw new BadRequestException('thumbnail is not allowed for non-reels post');
            for (const img of files.images) {
                if (!isImage(img.mimetype)) throw new BadRequestException(`Invalid image mime type: ${img.mimetype}`);
            }
        }
    }

    async create(
        data: { caption?: string; isReels: boolean; userId: number },
        files: { images: ImageFile[]; video: VideoFile | null; thumbnail: ImageFile | null }
    ) {
        this.assertPayload(data, files);

        if (data.isReels) {
            const videoUrl = await this.s3.uploadBuffer(files.video!.buffer, files.video!.mimetype, 'posts/videos');
            const thumbnailUrl = await this.s3.uploadBuffer(files.thumbnail!.buffer, files.thumbnail!.mimetype, 'posts/thumbnail');

            return this.prisma.$transaction(async (tx) => {
                const created = await tx.post.create({
                    data: {
                        caption: data.caption,
                        isReels: true,
                        videoUrl,
                        userId: data.userId,
                        thumbnail: thumbnailUrl,
                    },
                    include: {
                        images: true,
                        user: { select: { id: true, username: true, avatarUrl: true } },
                    },
                });

                await tx.user.update({
                    where: { id: data.userId },
                    data: { postCount: { increment: 1 } },
                });

                return created;
            });
        } else {
            const uploaded = await Promise.all(
                files.images.map((img, idx) =>
                    this.s3.uploadBuffer(img.buffer, img.mimetype, 'posts/images').then((url) => ({ url, position: idx }))
                )
            );

            return this.prisma.$transaction(async (tx) => {
                const created = await tx.post.create({
                    data: {
                        caption: data.caption,
                        isReels: false,
                        userId: data.userId,
                        images: { create: uploaded.map((u) => ({ url: u.url, position: u.position })) },
                    },
                    include: {
                        images: { orderBy: { position: 'asc' } },
                        user: { select: { id: true, username: true, avatarUrl: true } },
                    },
                });

                await tx.user.update({
                    where: { id: data.userId },
                    data: { postCount: { increment: 1 } },
                });

                return created;
            });
        }
    }

    async delete(userId: number, id: number) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            select: {
                userId: true,
                isReels: true,
                videoUrl: true,
                images: { select: { url: true } },
            },
        });

        if (!post) throw new ForbiddenException('Post not found');
        if (post.userId !== userId) throw new ForbiddenException('You are not allowed to delete this post');

        await this.prisma.$transaction(async (tx) => {
            await tx.post.delete({ where: { id } });
            await tx.user.update({ where: { id: userId }, data: { postCount: { decrement: 1 } } });
        });

        return { message: 'Deleted' };
    }

    async getAllPosts(viewerId: number, { isReels, cursor, limit }: { isReels: boolean; cursor?: number; limit?: number }) {
        const take = Math.min(Math.max(limit || 20, 1), 100);

        const posts = await this.prisma.post.findMany({
            where: {
                user: { isPrivate: false },
                userId: { not: viewerId }, 
                isReels
            },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                caption: true,
                isReels: true,
                videoUrl: true,
                thumbnail: true,
                createdAt: true,
                likesCount: true,
                commentsCount: true,
                savedCount: true,
                shareCount: true,
                images: { orderBy: { position: 'asc' }, select: { id: true, url: true, position: true, createdAt: true } },
                user: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                        followers: { where: { followerId: viewerId }, select: { id: true }, take: 1 },
                        incomingFollowRequests: {
                            where: { requesterId: viewerId },
                            select: { id: true, status: true },
                            take: 1,
                        },
                    },
                },
                likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
                savedBy: { where: { userId: viewerId }, select: { id: true }, take: 1 },
            },
        });

        const items = posts.map((p) => {
            const followReq = p.user.incomingFollowRequests?.[0] || null;
            return {
                id: p.id,
                caption: p.caption,
                isReels: p.isReels,
                videoUrl: p.videoUrl,
                thumbnail: p.thumbnail,
                createdAt: p.createdAt,
                user: {
                    id: p.user.id,
                    username: p.user.username,
                    fullName: p.user.fullName,
                    avatarUrl: p.user.avatarUrl,
                },
                images: p.images,
                counts: {
                    likes: p.likesCount,
                    comments: p.commentsCount,
                    saved: p.savedCount,
                    shared: p.shareCount,
                },
                liked: p.likes.length > 0,
                saved: p.savedBy.length > 0,
                followsAuthor: p.user.followers.length > 0,
                followRequest: followReq ? { id: followReq.id, status: followReq.status } : null,
            };
        });

        const hasMore = posts.length === take;
        const nextCursor = hasMore ? posts[posts.length - 1].id : null;

        return { items, nextCursor };
    }

    // ===== COMMENTS =====
    async addComment(userId: number, postId: number, content: string) {
        const text = (content ?? '').trim();
        if (!text) throw new BadRequestException('Content is required');
        if (text.length > 1000) throw new BadRequestException('Content is too long (max 1000)');

        return this.prisma.$transaction(async (tx) => {
            await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true } });

            const comment = await tx.comment.create({
                data: { content: text, userId, postId, parentId: null },
                select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                },
            });

            await tx.post.update({ where: { id: postId }, data: { commentsCount: { increment: 1 } } });

            return { ...comment, counts: { likes: 0, replies: 0 }, liked: false };
        });
    }

    async addReply(userId: number, parentCommentId: number, content: string) {
        const text = (content ?? '').trim();
        if (!text) throw new BadRequestException('Content is required');
        if (text.length > 1000) throw new BadRequestException('Content is too long (max 1000)');

        return this.prisma.$transaction(async (tx) => {
            const parent = await tx.comment.findUnique({
                where: { id: parentCommentId },
                select: { id: true, postId: true },
            });
            if (!parent) throw new NotFoundException('Parent comment not found');
            if (!parent.postId) throw new BadRequestException('Parent comment has no post');

            const reply = await tx.comment.create({
                data: { content: text, userId, postId: parent.postId, parentId: parent.id },
                select: {
                    id: true,
                    content: true,
                    createdAt: true,
                    user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                },
            });

            await tx.post.update({ where: { id: parent.postId }, data: { commentsCount: { increment: 1 } } });

            return { ...reply, counts: { likes: 0, replies: 0 }, liked: false };
        });
    }

    async getPostComments(viewerId: number, postId: number, { cursor, limit }: { cursor?: number; limit?: number }) {
        await this.prisma.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true } });

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const comments = await this.prisma.comment.findMany({
            where: { postId, parentId: null },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
            },
        });

        const items = comments.map((c) => ({
            id: c.id,
            content: c.content,
            createdAt: c.createdAt,
            user: c.user,
            counts: { likes: 0, replies: 0 },
            liked: c.likes.length > 0,
        }));

        const hasMore = comments.length === take;
        const nextCursor = hasMore ? comments[comments.length - 1].id : null;

        return { items, nextCursor };
    }

    async getCommentReplies(viewerId: number, commentId: number, { cursor, limit }: { cursor?: number; limit?: number }) {
        await this.prisma.comment.findUniqueOrThrow({ where: { id: commentId }, select: { id: true } });

        const take = Math.min(Math.max(limit || 20, 1), 100);

        const replies = await this.prisma.comment.findMany({
            where: { parentId: commentId },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                content: true,
                createdAt: true,
                user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
                likes: { where: { userId: viewerId }, select: { id: true }, take: 1 },
            },
        });

        const items = replies.map((r) => ({
            id: r.id,
            content: r.content,
            createdAt: r.createdAt,
            user: r.user,
            counts: { likes: 0, replies: 0 },
            liked: r.likes.length > 0,
        }));

        const hasMore = replies.length === take;
        const nextCursor = hasMore ? replies[replies.length - 1].id : null;

        return { items, nextCursor };
    }

    // ===== COMMENT LIKES =====
    async likeComment(userId: number, commentId: number) {
        return this.prisma.$transaction(async (tx) => {
            await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { id: true } });

            try {
                await tx.commentLike.create({ data: { userId, commentId } });
                const { likesCount } = await tx.comment.update({
                    where: { id: commentId },
                    data: { likesCount: { increment: 1 } },
                    select: { likesCount: true },
                });
                return { ok: true, liked: true, likesCount };
            } catch (e: any) {
                if (e?.code !== 'P2002') throw e;
                const { likesCount } = await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { likesCount: true } });
                return { ok: true, liked: true, likesCount };
            }
        });
    }

    async unlikeComment(userId: number, commentId: number) {
        return this.prisma.$transaction(async (tx) => {
            await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { id: true } });

            const del = await tx.commentLike.deleteMany({ where: { userId, commentId } });
            if (del.count > 0) {
                await tx.comment.updateMany({
                    where: { id: commentId, likesCount: { gt: 0 } },
                    data: { likesCount: { decrement: 1 } },
                });
            }

            const { likesCount } = await tx.comment.findUniqueOrThrow({ where: { id: commentId }, select: { likesCount: true } });
            return { ok: true, liked: false, likesCount };
        });
    }

    // ===== POST LIKES =====
    async likePost(userId: number, postId: number) {
        return this.prisma.$transaction(async (tx) => {
            await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true } });

            try {
                await tx.like.create({ data: { userId, postId } });
                const { likesCount } = await tx.post.update({
                    where: { id: postId },
                    data: { likesCount: { increment: 1 } },
                    select: { likesCount: true },
                });
                return { liked: true, likesCount };
            } catch (e: any) {
                if (e?.code !== 'P2002') throw e; // уже лайкнуто
                const { likesCount } = await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { likesCount: true } });
                return { liked: true, likesCount };
            }
        });
    }

    async unlikePost(userId: number, postId: number) {
        return this.prisma.$transaction(async (tx) => {
            await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true } });

            const del = await tx.like.deleteMany({ where: { userId, postId } });
            if (del.count > 0) {
                await tx.post.updateMany({
                    where: { id: postId, likesCount: { gt: 0 } },
                    data: { likesCount: { decrement: 1 } },
                });
            }

            const { likesCount } = await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { likesCount: true } });
            return { liked: false, likesCount };
        });
    }

    async savePost(userId: number, postId: number) {
        return this.prisma.$transaction(async (tx) => {
            await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true } });

            try {
                await tx.savedPost.create({ data: { userId, postId } });
                const { savedCount } = await tx.post.update({
                    where: { id: postId },
                    data: { savedCount: { increment: 1 } },
                    select: { savedCount: true },
                });
                return { saved: true, savedCount };
            } catch (e: any) {
                if (e?.code !== 'P2002') throw e;
                const { savedCount } = await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { savedCount: true } });
                return { saved: true, savedCount };
            }
        });
    }

    async unsavePost(userId: number, postId: number) {
        return this.prisma.$transaction(async (tx) => {
            await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { id: true } });

            const del = await tx.savedPost.deleteMany({ where: { userId, postId } });
            if (del.count > 0) {
                await tx.post.updateMany({
                    where: { id: postId, savedCount: { gt: 0 } },
                    data: { savedCount: { decrement: 1 } },
                });
            }

            const { savedCount } = await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { savedCount: true } });
            return { saved: false, savedCount };
        });
    }
}
