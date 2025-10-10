import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FollowRequestsService {
    constructor(private readonly prisma: PrismaService) { }

    async cancelFollowRequest(viewerId: number, targetId: number) {
        await this.prisma.followRequest.deleteMany({
            where: { requesterId: viewerId, targetId, status: 'PENDING' },
        });
        return { status: 'canceled' };
    }

    async acceptFollowRequest(targetId: number, requesterId: number) {
        const req = await this.prisma.followRequest.findUnique({
            where: { requesterId_targetId: { requesterId, targetId } },
            select: { status: true },
        });
        if (!req || req.status !== 'PENDING') throw new NotFoundException('Request not found');

        await this.prisma.$transaction(async (tx) => {
            await tx.follower.upsert({
                where: { followerId_followingId: { followerId: requesterId, followingId: targetId } },
                update: {},
                create: { followerId: requesterId, followingId: targetId },
            });

            await tx.user.update({ where: { id: requesterId }, data: { followingCount: { increment: 1 } } });
            await tx.user.update({ where: { id: targetId }, data: { followersCount: { increment: 1 } } });

            await tx.followRequest.update({
                where: { requesterId_targetId: { requesterId, targetId } },
                data: { status: 'ACCEPTED' },
            });
        });

        return { status: 'accepted' };
    }

    async rejectFollowRequest(targetId: number, requesterId: number) {
        const req = await this.prisma.followRequest.findUnique({
            where: { requesterId_targetId: { requesterId, targetId } },
            select: { status: true },
        });
        if (!req || req.status !== 'PENDING') throw new NotFoundException('Request not found');

        await this.prisma.followRequest.update({
            where: { requesterId_targetId: { requesterId, targetId } },
            data: { status: 'REJECTED' },
        });
        return { status: 'rejected' };
    }

    async listIncomingFollowRequests(userId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);
        const rows = await this.prisma.followRequest.findMany({
            where: { targetId: userId, status: 'PENDING' },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                requesterId: true,
                createdAt: true,
                requester: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
        });

        const items = rows.map((r) => ({
            id: r.id,
            requester: r.requester,
            createdAt: r.createdAt,
        }));
        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

        return { items, nextCursor };
    }

    async listOutgoingFollowRequests(userId: number, cursor?: number, limit: number = 20) {
        const take = Math.min(Math.max(limit || 20, 1), 100);
        const rows = await this.prisma.followRequest.findMany({
            where: { requesterId: userId, status: 'PENDING' },
            orderBy: { id: 'desc' },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            take,
            select: {
                id: true,
                targetId: true,
                createdAt: true,
                target: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
            },
        });

        const items = rows.map((r) => ({
            id: r.id,
            target: r.target,
            createdAt: r.createdAt,
        }));
        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;

        return { items, nextCursor };
    }
}
