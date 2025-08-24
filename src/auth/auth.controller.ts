import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, RefreshTokenDto, ResendVerifyDto, RestorePasswordDto, SigninDto, SignupDto, TokenVerifyDto, VerifyDto } from './auth.dto';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('signup')
    async signup(@Body() dto: SignupDto) {
        return await this.authService.signup(dto.username, dto.email, dto.password, dto.fullName, dto.phone);
    }

    @Post('resend-verify')
    async resendVerify(@Body() dto: ResendVerifyDto) {
        return this.authService.resendVerification(dto.email);
    }

    @Post('verify')
    async verify(@Body() dto: VerifyDto) {
        return await this.authService.verify(dto.email, dto.code);
    }

    @Post('signin')
    async signin(@Body() dto: SigninDto) {
        return await this.authService.signin(dto.login, dto.password);
    }

    @Post('refresh')
    async refreshTokens(@Body() dto: RefreshTokenDto) {
        return await this.authService.refreshTokens(dto.refreshToken);
    }

    @Post('forgot-password')
    async forgotPassword(@Body() dto: ForgotPasswordDto) {
        return this.authService.forgotPassword(dto.email);
    }

    @Post('restore-password')
    async restorePassword(@Body() dto: RestorePasswordDto) {
        return this.authService.restorePassword(dto.email, dto.code, dto.newPassword);
    }

    @Post('token/verify')
    async tokenVerify(@Body() dto: TokenVerifyDto) {
        return await this.authService.tokenVerify(dto.token);
    }
}
