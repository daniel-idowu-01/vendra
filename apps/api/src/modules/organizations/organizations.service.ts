import { Injectable } from "@nestjs/common";
import { OrganizationsRepository } from "./repositories/organizations.repository";

@Injectable()
export class OrganizationsService {
  constructor(private readonly orgRepo: OrganizationsRepository) {}

  listMemberships(userId: string) {
    return this.orgRepo.findActiveMembershipsByUser(userId);
  }
}
