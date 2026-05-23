import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { OrganizationsRepository } from "./repositories/organizations.repository";

@Injectable()
export class OrganizationsService {
  constructor(private readonly orgRepo: OrganizationsRepository) {}

  async listMemberships(userId: string) {
    try {
      return await this.orgRepo.findActiveMembershipsByUser(userId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[OrganizationsService.listMemberships] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve organizations.");
    }
  }
}
