import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthRepository } from "../../modules/auth/repositories/auth.repository";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly authRepo: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { sub: string };
      tenant?: unknown;
    }>();
    const organizationId = request.headers["x-organization-id"];
    if (!request.user?.sub || !organizationId) {
      throw new ForbiddenException("Missing organization context");
    }

    const membership = await this.authRepo.findMembershipByOrgAndUser(organizationId, request.user.sub);
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("You do not have access to this workspace");
    }

    request.tenant = { organizationId, role: membership.role };
    return true;
  }
}
