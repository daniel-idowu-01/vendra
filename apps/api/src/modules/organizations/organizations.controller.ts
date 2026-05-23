import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { OrganizationsService } from "./organizations.service";

@Controller({ path: "organizations", version: "1" })
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get()
  list(@CurrentUser() user: { sub: string }) {
    return this.orgService.listMemberships(user.sub);
  }
}
