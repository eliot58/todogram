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
            where: { OR: [{ username }, { email }, { phone }] }
        });

        if (exists) throw new BadRequestException('Пользователь уже существует');

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser = await this.prisma.user.create({
            data: {
                username,
                fullName,
                email,
                phone,
                passwordHash
            }
        });

        const cooldownKey = `otp:cooldown:${newUser.id}`;
        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await this.redisService.setKey(`otp:${newUser.id}`, code, 600);
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

        return { message: 'Код подтверждения был отправлен на вашу почту' };
    }


    public async resendVerification(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true, isVerify: true }
        });

        if (!user) throw new BadRequestException('Пользователь не найден');

        if (user.isVerify) throw new BadRequestException('Аккаунт уже подтверждён');

        const cooldownKey = `otp:cooldown:${user.id}`;
        const onCooldown = await this.redisService.getKey(cooldownKey);
        
        if (onCooldown) return { message: 'Код уже был отправлен. Пожалуйста, подождите перед повторным запросом.' };

        const code = Math.floor(100000 + Math.random() * 900000).toString();

        await this.redisService.setKey(`otp:${user.id}`, code, 600);
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

        return { message: 'Код подтверждения был отправлен на вашу почту' };
    }

    public async verify(login: string, code: string) {
        const user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { email: login },
                    { phone: login }
                ]
            }
        });

        if (!user) throw new BadRequestException('Пользователь не найден');
        if (user.isVerify) throw new BadRequestException('Аккаунт уже подтверждён');

        const otp = await this.redisService.getKey(`otp:${user.id}`);
        if (!otp || otp !== code) throw new BadRequestException('Неверный или просроченный код');

        await this.prisma.user.update({
            where: { id: user.id },
            data: { isVerify: true }
        });

        await this.redisService.deleteKey(`otp:${user.id}`);

        const accessToken = await this.generateAccessToken(user.id);
        const refreshToken = await this.generateRefreshToken(user.id);

        return {
            message: 'Аккаунт успешно подтверждён',
            tokens: {
                accessToken,
                refreshToken,
            },
        };
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

        if (!user) throw new UnauthorizedException('Неверные учетные данные');
        if (!user.isVerify) throw new UnauthorizedException('Аккаунт не подтверждён');

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) throw new UnauthorizedException('Неверный логин или пароль');

        const accessToken = await this.generateAccessToken(user.id);
        const refreshToken = await this.generateRefreshToken(user.id);

        return {
            message: 'Вход выполнен успешно',
            tokens: {
                accessToken,
                refreshToken
            }
        };
    }

    public async refreshTokens(refreshToken: string) {
        try {
            const payload = await this.jwtService.verifyAsync(refreshToken);

            if (payload.type !== "refresh") throw new UnauthorizedException('Неверный тип токена');

            const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
            if (!user) throw new UnauthorizedException('Пользователь не найден');

            const newAccessToken = await this.generateAccessToken(payload.sub);
            const newRefreshToken = await this.generateRefreshToken(payload.sub);

            return { newAccessToken, newRefreshToken };

        } catch {
            throw new UnauthorizedException('Недействительный refresh-токен');
        }
    }

    public async forgotPassword(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });

        if (!user) throw new BadRequestException('Пользователь не найден');

        const cooldownKey = `fp:cooldown:${email}`;
        const onCooldown = await this.redisService.getKey(cooldownKey);
        if (onCooldown) return { message: 'Код уже был отправлен. Пожалуйста, подождите перед повторным запросом.' };

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

        return { message: 'Код для восстановления пароля был отправлен на вашу почту' };
    }

    public async restorePassword(email: string, code: string, newPassword: string) {
        const saved = await this.redisService.getKey(`fp:${email}`);
        if (!saved || saved !== code) throw new BadRequestException('Неверный или просроченный код');

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await this.prisma.user.update({
            where: { email },
            data: { passwordHash },
        });

        await this.redisService.deleteKey(`fp:${email}`);
        await this.redisService.deleteKey(`fp:cooldown:${email}`);

        return { message: 'Пароль успешно сброшен' };
    }

    public async tokenVerify(token: string) {
        try {
            await this.jwtService.verifyAsync(token);
        } catch {
            throw new UnauthorizedException('Invalid or expired token');
        }

        return { detail: 'Token is valid' };
    }

    public async isUsernameAvailable(username: string): Promise<boolean> {
        const existing = await this.prisma.user.findFirst({
            where: { username: { equals: username, mode: 'insensitive' } },
            select: { id: true },
        });
        return !existing;
    }

    public async isPhoneAvailable(phone: string): Promise<boolean> {
        const existing = await this.prisma.user.findFirst({
            where: { phone: { equals: phone, mode: 'insensitive' } },
            select: { id: true },
        });
        return !existing;
    }

    public async isEmailAvailable(email: string): Promise<boolean> {
        const existing = await this.prisma.user.findFirst({
            where: { email: { equals: email, mode: 'insensitive' } },
            select: { id: true },
        });
        return !existing;
    }
}
