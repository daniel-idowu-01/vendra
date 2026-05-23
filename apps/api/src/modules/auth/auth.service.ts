import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { PrismaService } from "../../prisma/prisma.service";
import { LoginDto, SignupDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async signup(dto: SignupDto) {
    try {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new BadRequestException("Email is already registered");

    const passwordHash = await argon2.hash(dto.password);
    const slug = dto.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email.toLowerCase(), name: dto.name, passwordHash }
      });
      const organization = await tx.organization.create({
        data: { name: dto.organizationName, slug: `${slug}-${Date.now().toString(36)}` }
      });
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId: user.id, role: "OWNER" }
      });
      await tx.branch.create({
        data: { organizationId: organization.id, name: "Main branch" }
      });
      return { user, organization };
    });

    return this.issueTokens(result.user.id, result.user.email, result.organization.id);
    } catch (error) {
      console.error("Signup error:", error);
      throw new BadRequestException("Failed to create account");
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Invalid email or password");
    }
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });
    return this.issueTokens(user.id, user.email, membership?.organizationId);
  }

  async refresh(refreshToken: string) {
    const payload = this.jwt.verify<{ sub: string; email: string; organizationId?: string }>(refreshToken, {
      secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET")
    });
    return this.issueTokens(payload.sub, payload.email, payload.organizationId);
  }

  private issueTokens(userId: string, email: string, organizationId?: string) {
    const payload = { sub: userId, email, organizationId };
    return {
      accessToken: this.jwt.sign(payload, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: "15m"
      }),
      refreshToken: this.jwt.sign(payload, {
        secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: "30d"
      }),
      organizationId
    };
  }
}
