import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from 'generated/prisma';

@Injectable()
export class BlockedService {
    constructor(private readonly prisma: PrismaService) { }

    async blockUser(ownerId: number, targetId: number) {
        const target = await this.prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true },
        });
        if (!target) throw new NotFoundException('User not found');

        try {
            const item = await this.prisma.$transaction(async (tx) => {
                const created = await tx.block.create({
                    data: { blockerId: ownerId, blockedId: targetId },
                    include: {
                        blocked: {
                            select: {
                                id: true,
                                username: true,
                                fullName: true,
                                avatarUrl: true
                            },
                        },
                    },
                });

                const delOwnerFollowing = await tx.follower.deleteMany({
                    where: { followerId: ownerId, followingId: targetId },
                });
                if (delOwnerFollowing.count > 0) {
                    await tx.user.update({
                        where: { id: ownerId },
                        data: { followingCount: { decrement: delOwnerFollowing.count } },
                    });
                    await tx.user.update({
                        where: { id: targetId },
                        data: { followersCount: { decrement: delOwnerFollowing.count } },
                    });
                }

                const delTargetFollowing = await tx.follower.deleteMany({
                    where: { followerId: targetId, followingId: ownerId },
                });
                if (delTargetFollowing.count > 0) {
                    await tx.user.update({
                        where: { id: targetId },
                        data: { followingCount: { decrement: delTargetFollowing.count } },
                    });
                    await tx.user.update({
                        where: { id: ownerId },
                        data: { followersCount: { decrement: delTargetFollowing.count } },
                    });
                }

                await tx.user.update({
                    where: { id: ownerId },
                    data: { blockedCount: { increment: 1 } },
                });

                await tx.followRequest.deleteMany({
                    where: {
                        OR: [
                            { requesterId: ownerId, targetId },
                            { requesterId: targetId, targetId: ownerId },
                        ],
                    },
                });
                await tx.closeFriend.deleteMany({
                    where: {
                        OR: [
                            { ownerId: ownerId, friendId: targetId },
                            { ownerId: targetId, friendId: ownerId },
                        ],
                    },
                });

                return created;
            });

            return { ok: true, item };
        } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
                const item = await this.prisma.block.findUnique({
                    where: { blockerId_blockedId: { blockerId: ownerId, blockedId: targetId } },
                    include: {
                        blocked: {
                            select: {
                                id: true,
                                username: true,
                                fullName: true,
                                avatarUrl: true
                            },
                        },
                    },
                });
                return { ok: true, item };
            }
            throw e;
        }
    }

    async unblockUser(ownerId: number, targetId: number) {
        const exists = await this.prisma.block.findUnique({
            where: { blockerId_blockedId: { blockerId: ownerId, blockedId: targetId } },
            select: { id: true },
        });

        if (!exists) return { ok: true, removed: false };

        await this.prisma.$transaction(async (tx) => {
            await tx.block.delete({ where: { blockerId_blockedId: { blockerId: ownerId, blockedId: targetId } } });
            await tx.user.update({ where: { id: ownerId }, data: { blockedCount: { decrement: 1 } } });
        });

        return { ok: true, removed: true };
    }
}
