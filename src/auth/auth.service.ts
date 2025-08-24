import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessPayload, RefreshPayload } from './jwt.interface';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_EXPIRE_MINUTES, REFRESH_TOKEN_EXPIRE_DAYS } from '../constants/auth.constants';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../redis/redis.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
    constructor(
        private readonly jwtService: JwtService,
        private readonly prisma: PrismaService,
        private readonly redisService: RedisService,
        private readonly mailService: MailerService,
        private readonly configService: ConfigService,
    ) { }

    public async generateAccessToken(userId: number): Promise<string> {
        const payload: AccessPayload = { sub: userId, type: "access" };
        return await this.jwtService.signAsync(payload, {
            expiresIn: ACCESS_TOKEN_EXPIRE_MINUTES,
        });
    }

    public async generateRefreshToken(userId: number): Promise<string> {
        const payload: RefreshPayload = { sub: userId, type: "refresh" };
        return await this.jwtService.signAsync(payload, {
            expiresIn: REFRESH_TOKEN_EXPIRE_DAYS,
        });
    }

    public async signup(username: string, email: string, password: string, fullName: string, phone: string) {
        const exists = await this.prisma.user.findFirst({
            where: { OR: [{ username }, { email }] }
        });
        
        if (exists) throw new BadRequestException('User already exists');
    
        const passwordHash = await bcrypt.hash(password, 10);
    
        await this.prisma.user.create({
            data: {
                username,
                fullName,
                email,
                phone,
                passwordHash
            }
        });
    
        const cooldownKey = `otp:cooldown:${email}`;
        const onCooldown = await this.redisService.getKey(cooldownKey);
        if (onCooldown) {
            return { message: 'OTP has already been sent. Please wait before requesting again.' };
        }
    
        const code = Math.floor(100000 + Math.random() * 900000).toString();
    
        await this.redisService.setKey(`otp:${email}`, code, 600);
        await this.redisService.setKey(cooldownKey, '1', 60);
    
        const fromEmail = this.configService.get<string>('EMAIL_HOST_USER');
    
        const message = `<h2>Ваш код подтверждения</h2>
            <p>Введите этот код для подтверждения аккаунта: <strong>${code}</strong></p>
            <p>Срок действия кода — 10 минут.</p>`;
    
        await this.mailService.sendMail({
            from: fromEmail,
            to: email,
            subject: 'Код подтверждения аккаунта',
            html: message,
        });
    
        return { message: 'OTP has been sent to your email' };
    }
    

    public async resendVerification(email: string) {
        const cooldownKey = `otp:cooldown:${email}`;
        const onCooldown = await this.redisService.getKey(cooldownKey);
        if (onCooldown) {
            return { message: 'If this email is registered, a verification code has been sent.' };
        }

        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, isVerify: true }
        });

        if (user && !user.isVerify) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();

            await this.redisService.setKey(`otp:${email}`, code, 600);

            await this.redisService.setKey(cooldownKey, '1', 60);

            const fromEmail = this.configService.get<string>('EMAIL_HOST_USER');
            const message = `<h2>Ваш код подтверждения</h2>
                <p>Введите этот код для подтверждения аккаунта: <strong>${code}</strong></p>
                <p>Срок действия кода — 10 минут.</p>`;

            await this.mailService.sendMail({
                from: fromEmail,
                to: email,
                subject: 'Код подтверждения аккаунта',
                html: message,
            });
        }

        return { message: 'If this email is registered, a verification code has been sent.' };
    }


    public async verify(email: string, code: string) {
        const otp = await this.redisService.getKey(`otp:${email}`);

        if (!otp || otp !== code) {
            throw new BadRequestException('Invalid or expired code');
        }

        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, isVerify: true }
        });

        if (!user) {
            throw new BadRequestException('User not found');
        }

        if (user.isVerify) {
            throw new BadRequestException('Account already verified');
        }

        await this.prisma.user.update({
            where: { email },
            data: { isVerify: true }
        });

        await this.redisService.deleteKey(`otp:${email}`);

        return { message: 'Account has been verified' };
    }

    public async signin(login: string, password: string) {
        const user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { email: login },
                    { username: login },
                    { phone: login }
                ]
            }
        });

        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }

        if (!user.isVerify) {
            throw new UnauthorizedException('Account is not verified');
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const accessToken = await this.generateAccessToken(user.id);
        const refreshToken = await this.generateRefreshToken(user.id);

        return {
            message: 'Signed in successfully',
            tokens: {
                accessToken,
                refreshToken
            }
        };
    }

    public async refreshTokens(refreshToken: string) {
        try {
            const payload = await this.jwtService.verifyAsync(refreshToken);

            if (payload.type !== "refresh") throw new UnauthorizedException('Invalid token type');

            const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
            if (!user) throw new UnauthorizedException('User not found');

            const newAccessToken = await this.generateAccessToken(payload.sub);
            const newRefreshToken = await this.generateRefreshToken(payload.sub);

            return { newAccessToken, newRefreshToken };

        } catch (error) {
            throw new UnauthorizedException('Invalid refresh token');
        }
    }

    public async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });

        const cooldownKey = `fp:cooldown:${email}`;
        const onCooldown = await this.redisService.getKey(cooldownKey);
        if (onCooldown) {
            return { message: 'If this email is registered, a reset code has been sent.' };
        }

        if (user) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();

            await this.redisService.setKey(`fp:${email}`, code, 600);
            await this.redisService.setKey(cooldownKey, '1', 60);

            const fromEmail = this.configService.get<string>('EMAIL_HOST_USER');
            const html = `
            <h2>Восстановление пароля</h2>
            <p>Ваш код для сброса пароля: <strong>${code}</strong></p>
            <p>Срок действия кода — 10 минут.</p>
          `;

            await this.mailService.sendMail({
                from: fromEmail,
                to: email,
                subject: 'Код для восстановления пароля',
                html,
            });
        }

        return { message: 'If this email is registered, a reset code has been sent.' };
    }

    public async restorePassword(email: string, code: string, newPassword: string) {
        const saved = await this.redisService.getKey(`fp:${email}`);
        if (!saved || saved !== code) {
            throw new BadRequestException('Invalid or expired code');
        }

        const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (!user) {
            await this.redisService.deleteKey(`fp:${email}`);
            throw new BadRequestException('Invalid or expired code');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await this.prisma.user.update({
            where: { email },
            data: { passwordHash },
        });

        await this.redisService.deleteKey(`fp:${email}`);

        return { message: 'Password has been reset successfully' };
    }

    public async tokenVerify(token: string) {
        try {
            await this.jwtService.verifyAsync(token);
        } catch (err) {
            throw new UnauthorizedException('Invalid or expired token');
        }

        return { detail: 'Token is valid' };
    }
}
