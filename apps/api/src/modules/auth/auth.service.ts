import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthRepository } from "./repositories/auth.repository";
import { LoginDto, SignupDto } from "./dto/auth.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async signup(dto: SignupDto) {
    try {
      const existing = await this.authRepo.findUserByEmail(dto.email.toLowerCase());
      if (existing) throw new BadRequestException("Email is already registered");

      const passwordHash = await argon2.hash(dto.password);
      const slug = dto.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const result = await this.prisma.$transaction(async (tx) => {
        const user = await this.authRepo.createUser(
          { email: dto.email.toLowerCase(), name: dto.name, passwordHash, phone: dto.phone },
          tx
        );
        const organization = await this.authRepo.createOrganization(
          { name: dto.organizationName, slug: `${slug}-${Date.now().toString(36)}` },
          tx
        );
        await this.authRepo.createOrganizationMember(
          {
            organization: { connect: { id: organization.id } },
            user: { connect: { id: user.id } },
            role: "OWNER"
          },
          tx
        );
        await this.authRepo.createBranch(
          { organization: { connect: { id: organization.id } }, name: "Main branch" },
          tx
        );
        return { user, organization };
      });

      return this.issueTokens(result.user.id, result.user.email, result.organization.id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[AuthService.signup] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to create account. Please try again.");
    }
  }

  async login(dto: LoginDto) {
    try {
      const user = await this.authRepo.findUserByEmail(dto.email.toLowerCase());
      if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
        throw new UnauthorizedException("Invalid email or password");
      }
      const membership = await this.authRepo.findFirstActiveMembership(user.id);
      return this.issueTokens(user.id, user.email, membership?.organizationId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[AuthService.login] Unexpected error:", error);
      throw new InternalServerErrorException("Login failed. Please try again.");
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<{ sub: string; email: string; organizationId?: string }>(
        refreshToken,
        { secret: this.config.getOrThrow<string>("JWT_REFRESH_SECRET") }
      );
      return this.issueTokens(payload.sub, payload.email, payload.organizationId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && error.name === "JsonWebTokenError") {
        throw new UnauthorizedException("Invalid or expired refresh token");
      }
      Logger.error("[AuthService.refresh] Unexpected error:", error);
      throw new InternalServerErrorException("Token refresh failed. Please try again.");
    }
  }

  async linkWhatsApp(userId: string, organizationId: string | undefined, phone: string) {
    try {
      const normalizedPhone = phone?.trim();
      if (!normalizedPhone) {
        throw new BadRequestException("Phone number is required");
      }

      let resolvedOrganizationId = organizationId;
      if (!resolvedOrganizationId) {
        const membership = await this.authRepo.findFirstActiveMembership(userId);
        resolvedOrganizationId = membership?.organizationId;
      }

      if (!resolvedOrganizationId) {
        throw new BadRequestException("No active organization found for this user");
      }

      const existing = await this.prisma.whatsAppIdentity.findUnique({ where: { phone: normalizedPhone } });
      if (existing && existing.userId !== userId) {
        throw new ConflictException("This phone number is already linked to another account");
      }
      if (existing && existing.userId === userId) return { linked: true, phone: normalizedPhone };

      await this.prisma.whatsAppIdentity.create({
        data: { phone: normalizedPhone, userId, organizationId: resolvedOrganizationId }
      });
      await this.prisma.user.update({ where: { id: userId }, data: { phone: normalizedPhone } });
      return { linked: true, phone: normalizedPhone };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException("This phone number is already linked to another account");
        }
        if (error.code === "P2003") {
          throw new BadRequestException("Invalid user or organization for WhatsApp linking");
        }
      }
      Logger.error("[AuthService.linkWhatsApp] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to link WhatsApp number. Please try again.");
    }
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

