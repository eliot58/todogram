import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

@Injectable()
export class UsersService {
    constructor(private readonly prisma: PrismaService, private s3: S3Service) { }

    async getUserById(userId: number) {
        return this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                fullName: true,
                email: true,
                bio: true,
                avatarUrl: true,
                isVerify: true,
                createdAt: true,
            },
        });
    }

    async updateProfile(
        userId: number,
        dto: any,
        avatar?: { buffer: Buffer; filename: string; mimetype: string } | null
    ) {
        if ('avatar' in dto) {
            delete dto.avatar;
        }

        if (dto.username) {
            const exists = await this.prisma.user.findFirst({
                where: { username: dto.username, NOT: { id: userId } },
            });
            if (exists) throw new BadRequestException('Username already taken');
        }

        if (dto.email) {
            const exists = await this.prisma.user.findFirst({
                where: { email: dto.email, NOT: { id: userId } },
            });
            if (exists) throw new BadRequestException('Email already taken');
        }

        let avatarUrl: string | undefined;
        if (avatar) {
            avatarUrl = await this.s3.uploadBuffer(
                avatar.buffer,
                avatar.mimetype,
                `avatars`,
                avatar.filename,
            );

        }

        const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: { ...dto, ...(avatarUrl ? { avatarUrl } : {}) },
            select: {
                id: true,
                username: true,
                fullName: true,
                bio: true,
                avatarUrl: true,
                email: true,
                isVerify: true,
                createdAt: true,
            },
        });

        return { message: 'Profile updated successfully', user: updatedUser };
    }


    async getFollowers(userId: number, page: number, limit: number) {
        const skip = (page - 1) * limit;

        const followers = await this.prisma.follower.findMany({
            where: { followingId: userId },
            skip,
            take: limit,
            select: {
                follower: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        const total = await this.prisma.follower.count({ where: { followingId: userId } });

        return {
            total,
            page,
            limit,
            followers: followers.map(f => f.follower),
        };
    }

    async getFollowing(userId: number, page: number, limit: number) {
        const skip = (page - 1) * limit;

        const following = await this.prisma.follower.findMany({
            where: { followerId: userId },
            skip,
            take: limit,
            select: {
                following: {
                    select: {
                        id: true,
                        username: true,
                        fullName: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        const total = await this.prisma.follower.count({ where: { followerId: userId } });

        return {
            total,
            page,
            limit,
            following: following.map(f => f.following),
        };
    }

    async follow(userId: number, targetId: number) {
        if (userId === targetId) {
            throw new BadRequestException("You cannot follow yourself");
        }

        const exists = await this.prisma.follower.findUnique({
            where: {
                followerId_followingId: { followerId: userId, followingId: targetId }
            }
        });

        if (exists) {
            throw new BadRequestException("Already following this user");
        }

        await this.prisma.follower.create({
            data: { followerId: userId, followingId: targetId }
        });

        return { message: "Successfully followed the user" };
    }

    async unfollow(userId: number, targetId: number) {
        const exists = await this.prisma.follower.findUnique({
            where: {
                followerId_followingId: { followerId: userId, followingId: targetId }
            }
        });

        if (!exists) {
            throw new BadRequestException("You are not following this user");
        }

        await this.prisma.follower.delete({
            where: {
                followerId_followingId: { followerId: userId, followingId: targetId }
            }
        });

        return { message: "Successfully unfollowed the user" };
    }
}
