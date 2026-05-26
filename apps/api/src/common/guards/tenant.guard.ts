import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { sub: string };
      tenant?: unknown;
    }>();
    const rawOrganizationId = request.headers["x-organization-id"] as string | string[] | undefined;
    const organizationId = (Array.isArray(rawOrganizationId) ? rawOrganizationId[0] : rawOrganizationId)?.trim();
    if (!request.user?.sub || !organizationId) {
      this.logger.warn(`Blocked request: missing auth/tenant context (user=${request.user?.sub ?? "none"}, org=${organizationId ?? "none"})`);
      throw new ForbiddenException("Missing organization context");
    }

    try {
      const membership = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: request.user.sub } }
      });
      if (!membership || membership.status !== "ACTIVE") {
        this.logger.warn(`Blocked request: no active membership (user=${request.user.sub}, org=${organizationId})`);
        throw new ForbiddenException("You do not have access to this workspace");
      }

      request.tenant = { organizationId, role: membership.role };
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.error(`Tenant membership lookup failed (user=${request.user.sub}, org=${organizationId})`, error as Error);
      throw new ForbiddenException("Invalid organization context");
    }
  }
}
