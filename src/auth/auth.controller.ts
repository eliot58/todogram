import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshTokenDto, SigninDto, SignupDto, TokenVerifyDto, VerifyDto } from './auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('signup')
    async signup(@Body() dto: SignupDto) {
        return await this.authService.signup(dto.username, dto.email, dto.password, dto.fullName);
    }

    @Post('verify')
    async verify(@Body() dto: VerifyDto) {
        return await this.authService.verify(dto.email, dto.code);
    }

    @Post('signin')
    async signin(@Body() dto: SigninDto) {
        return await this.authService.signin(dto.email, dto.password);
    }

    @Post('refresh')
    async refreshTokens(@Body() dto: RefreshTokenDto) {
        return await this.authService.refreshTokens(dto.refreshToken);
    }

    @Post('token/verify')
    async tokenVerify(@Body() dto: TokenVerifyDto) {
        return await this.authService.tokenVerify(dto.token);
    }
}
