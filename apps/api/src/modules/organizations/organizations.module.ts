import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";
import { OrganizationsRepository } from "./repositories/organizations.repository";

@Module({
  imports: [JwtModule.register({})],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository]
})
export class OrganizationsModule {}
