import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RequestWithAuth } from './auth.types';
import { Logger } from 'nestjs-pino';

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly logger: Logger,
        private readonly jwtService: JwtService
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request: RequestWithAuth = context.switchToHttp().getRequest();
        const token = this.extractTokenFromHeader(request);

        if (!token) throw new UnauthorizedException('No token provided');

        try {
            const payload = await this.jwtService.verifyAsync(token);

            if (payload.type !== "access") throw new UnauthorizedException('Invalid token type');
            
            request.id = payload.sub;
        } catch (err) {
            throw new UnauthorizedException('Invalid or expired token');
        }

        return true;
    }

    private extractTokenFromHeader(request: RequestWithAuth): string | null {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        return authHeader.split(' ')[1];
    }
}
