import { BadRequestException, ConflictException, HttpException, Injectable, InternalServerErrorException, UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthRepository } from "./repositories/auth.repository";
import { LoginDto, SignupDto } from "./dto/auth.dto";
import { normalizePhone } from "../../common/utils/phone";

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  organizationId?: string;
};

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

      return this.issueSession(result.user.id, result.user.email, result.organization.id);
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
      return this.issueSession(user.id, user.email, membership?.organizationId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      Logger.error("[AuthService.login] Unexpected error:", error);
      throw new InternalServerErrorException("Login failed. Please try again.");
    }
  }

  /**
   * Validate an opaque refresh token from the httpOnly cookie, rotate it
   * (revoke the old one, issue a fresh one), and return a new session.
   */
  async rotateRefreshToken(rawToken: string | undefined): Promise<AuthSession> {
    const parsed = this.parseRefreshToken(rawToken);
    if (!parsed) throw new UnauthorizedException("Invalid or expired refresh token");

    const stored = await this.authRepo.findRefreshTokenById(parsed.id);
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const expectedHash = createHash("sha256").update(parsed.secret).digest("hex");
    const a = Buffer.from(expectedHash);
    const b = Buffer.from(stored.tokenHash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      // Secret mismatch on a known id — treat as tampering and revoke.
      await this.authRepo.revokeRefreshTokenById(stored.id);
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const user = await this.authRepo.findUserById(stored.userId);
    if (!user) throw new UnauthorizedException("Invalid or expired refresh token");

    const membership = await this.authRepo.findFirstActiveMembership(user.id);
    await this.authRepo.revokeRefreshTokenById(stored.id);
    return this.issueSession(user.id, user.email, membership?.organizationId);
  }

  /** Revoke the refresh token backing a session (logout). Best-effort. */
  async revokeRefreshToken(rawToken: string | undefined): Promise<void> {
    const parsed = this.parseRefreshToken(rawToken);
    if (!parsed) return;
    const stored = await this.authRepo.findRefreshTokenById(parsed.id);
    if (stored && !stored.revokedAt) {
      await this.authRepo.revokeRefreshTokenById(stored.id);
    }
  }

  async linkWhatsApp(userId: string, organizationId: string | undefined, phone: string) {
    try {
      const normalizedPhone = normalizePhone(phone);
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

      const existingForUser = await this.prisma.whatsAppIdentity.findFirst({
        where: { userId }
      });
      if (existingForUser && existingForUser.phone !== normalizedPhone) {
        throw new ConflictException(
          "You already have a WhatsApp number linked. Unlink it before linking another number."
        );
      }
      if (existingForUser && existingForUser.phone === normalizedPhone) {
        return { linked: true, phone: normalizedPhone };
      }

      const existing = await this.prisma.whatsAppIdentity.findUnique({ where: { phone: normalizedPhone } });
      if (existing && existing.userId !== userId) {
        throw new ConflictException("This phone number is already linked to another account");
      }

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

  async getWhatsAppLink(userId: string) {
    try {
      const identity = await this.prisma.whatsAppIdentity.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" }
      });

      return {
        linked: Boolean(identity),
        phone: identity?.phone ?? null
      };
    } catch (error) {
      Logger.error("[AuthService.getWhatsAppLink] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve WhatsApp link.");
    }
  }

  async unlinkWhatsApp(userId: string) {
    try {
      const identity = await this.prisma.whatsAppIdentity.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" }
      });

      if (!identity) return { linked: false, phone: null };

      await this.prisma.$transaction(async (tx) => {
        await tx.whatsAppIdentity.deleteMany({ where: { userId } });
        await tx.user.updateMany({
          where: { id: userId, phone: identity.phone },
          data: { phone: null }
        });
      });

      return { linked: false, phone: null };
    } catch (error) {
      Logger.error("[AuthService.unlinkWhatsApp] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to unlink WhatsApp number.");
    }
  }

  private async issueSession(
    userId: string,
    email: string,
    organizationId?: string
  ): Promise<AuthSession> {
    const accessToken = this.jwt.sign(
      { sub: userId, email, organizationId },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: "1h"
      }
    );
    const refreshToken = await this.createRefreshToken(userId);
    return { accessToken, refreshToken, organizationId };
  }

  /**
   * Mint an opaque refresh token, persist only its SHA-256 hash, and return the
   * raw `${id}.${secret}` value to be set as an httpOnly cookie. The plaintext
   * is never stored, so a DB leak cannot reconstruct valid tokens.
   */
  private async createRefreshToken(userId: string): Promise<string> {
    const secret = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(secret).digest("hex");
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const stored = await this.authRepo.createRefreshToken({ userId, tokenHash, expiresAt });
    return `${stored.id}.${secret}`;
  }

  private parseRefreshToken(raw: string | undefined): { id: string; secret: string } | null {
    if (!raw) return null;
    const separator = raw.indexOf(".");
    if (separator <= 0) return null;
    const id = raw.slice(0, separator);
    const secret = raw.slice(separator + 1);
    if (!id || !secret) return null;
    return { id, secret };
  }
}

