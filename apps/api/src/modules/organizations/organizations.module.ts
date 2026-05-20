import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OrganizationsController } from "./organizations.controller";

@Module({
  imports: [JwtModule.register({})],
  controllers: [OrganizationsController]
})
export class OrganizationsModule {}
