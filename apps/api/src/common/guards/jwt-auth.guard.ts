import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: unknown }>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined;
    if (!token) {
      this.logger.warn("Blocked request: missing bearer token");
      throw new UnauthorizedException("Missing bearer token");
    }

    request.user = this.jwt.verify(token, {
      secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET")
    });
    this.logger.debug("JWT verification passed");
    return true;
  }
}
