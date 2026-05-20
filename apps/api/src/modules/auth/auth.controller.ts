import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto, RefreshTokenDto, SignupDto } from "./dto/auth.dto";

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}
