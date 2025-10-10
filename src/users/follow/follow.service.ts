import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FollowService {
    constructor(private readonly prisma: PrismaService) { }

    async follow(userId: number, targetId: number) {
        if (userId === targetId) throw new BadRequestException('You cannot follow yourself');

        const target = await this.prisma.user.findUnique({
            where: { id: targetId },
            select: { id: true, isPrivate: true },
        });
        if (!target) throw new NotFoundException('User not found');

        const already = await this.prisma.follower.findUnique({
            where: { followerId_followingId: { followerId: userId, followingId: targetId } },
        });
        if (already) return { message: 'Already following this user' };

        if (target.isPrivate) {
            await this.prisma.followRequest.upsert({
                where: { requesterId_targetId: { requesterId: userId, targetId } },
                update: { status: 'PENDING' },
                create: { requesterId: userId, targetId, status: 'PENDING' },
                select: { id: true, status: true, createdAt: true },
            });

            return { message: 'Account is private request created' };
        }

        await this.prisma.$transaction(async (tx) => {
            await tx.follower.create({
                data: { followerId: userId, followingId: targetId },
            });
            await tx.user.update({ where: { id: userId }, data: { followingCount: { increment: 1 } } });
            await tx.user.update({ where: { id: targetId }, data: { followersCount: { increment: 1 } } });
            await tx.followRequest.deleteMany({ where: { requesterId: userId, targetId } });
        });

        return { message: 'Successfully followed the user' };
    }

    async unfollow(userId: number, targetId: number) {
        if (userId === targetId) throw new BadRequestException('You cannot unfollow yourself');

        await this.prisma.$transaction(async (tx) => {
            const del = await tx.follower.deleteMany({
                where: { followerId: userId, followingId: targetId },
            });
            if (del.count === 0) throw new BadRequestException('You are not following this user');

            await tx.user.updateMany({
                where: { id: targetId, followersCount: { gt: 0 } },
                data: { followersCount: { decrement: 1 } },
            });
            await tx.user.updateMany({
                where: { id: userId, followingCount: { gt: 0 } },
                data: { followingCount: { decrement: 1 } },
            });
        });

        return { message: 'Successfully unfollowed the user' };
    }
}
