import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  findUserByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  createRefreshToken(
    data: { userId: string; tokenHash: string; expiresAt: Date },
    tx?: Prisma.TransactionClient
  ) {
    return this.db(tx).refreshToken.create({ data });
  }

  findRefreshTokenById(id: string) {
    return this.prisma.refreshToken.findUnique({ where: { id } });
  }

  revokeRefreshTokenById(id: string, tx?: Prisma.TransactionClient) {
    return this.db(tx).refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() }
    });
  }

  createUser(data: Prisma.UserCreateInput, tx?: Prisma.TransactionClient) {
    return this.db(tx).user.create({ data });
  }

  createOrganization(data: Prisma.OrganizationCreateInput, tx?: Prisma.TransactionClient) {
    return this.db(tx).organization.create({ data });
  }

  createOrganizationMember(data: Prisma.OrganizationMemberCreateInput, tx?: Prisma.TransactionClient) {
    return this.db(tx).organizationMember.create({ data });
  }

  createBranch(data: Prisma.BranchCreateInput, tx?: Prisma.TransactionClient) {
    return this.db(tx).branch.create({ data });
  }

  findMembershipByOrgAndUser(organizationId: string, userId: string) {
    return this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } }
    });
  }

  findFirstActiveMembership(userId: string) {
    return this.prisma.organizationMember.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });
  }
}
