import { Body, Controller, Delete, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CookieOptions, Request, Response } from "express";
import { AuthService, AuthSession } from "./auth.service";
import { LoginDto, SignupDto } from "./dto/auth.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { AuthenticatedUser, CurrentUser } from "../../common/decorators/current-user.decorator";

const REFRESH_COOKIE = "vendra_rt";
const REFRESH_COOKIE_PATH = "/api/v1/auth";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService
  ) {}

  @Post("signup")
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.signup(dto);
    return this.respondWithSession(res, session);
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto);
    return this.respondWithSession(res, session);
  }

  @Post("refresh")
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.rotateRefreshToken(this.readRefreshCookie(req));
    return this.respondWithSession(res, session);
  }

  @Post("logout")
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeRefreshToken(this.readRefreshCookie(req));
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("link-whatsapp")
  linkWhatsApp(
    @CurrentUser() user: AuthenticatedUser,
    @Body("phone") phone: string
  ) {
    return this.auth.linkWhatsApp(user.sub, user.organizationId, phone);
  }

  @UseGuards(JwtAuthGuard)
  @Get("whatsapp-link")
  getWhatsAppLink(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getWhatsAppLink(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("whatsapp-link")
  unlinkWhatsApp(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.unlinkWhatsApp(user.sub);
  }

  // Set the refresh token as an httpOnly cookie and return only the access
  // token + org id in the body. The refresh token never reaches JS storage.
  private respondWithSession(res: Response, session: AuthSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.refreshCookieOptions());
    return { accessToken: session.accessToken, organizationId: session.organizationId };
  }

  private refreshCookieOptions(): CookieOptions {
    const isProd = this.config.get<string>("NODE_ENV") === "production";
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS
    };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;
    for (const part of header.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === REFRESH_COOKIE) return decodeURIComponent(rest.join("="));
    }
    return undefined;
  }
}
