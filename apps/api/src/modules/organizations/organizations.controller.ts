import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PrismaService } from "../../prisma/prisma.service";

@Controller({ path: "organizations", version: "1" })
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.prisma.organizationMember.findMany({
      where: { userId: user.sub, status: "ACTIVE" },
      include: { organization: true },
      orderBy: { createdAt: "asc" }
    });
  }
}
