import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { CustomersRepository } from "./repositories/customers.repository";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepo: CustomersRepository) {}

  async list(organizationId: string) {
    try {
      return await this.customersRepo.findManyByOrg(organizationId);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[CustomersService.list] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to retrieve customers.");
    }
  }

  async create(organizationId: string, dto: CreateCustomerDto) {
    try {
      return await this.customersRepo.create({
        organization: { connect: { id: organizationId } },
        name: dto.name,
        phone: dto.phone,
        whatsappPhone: dto.whatsappPhone
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error("[CustomersService.create] Unexpected error:", error);
      throw new InternalServerErrorException("Failed to create customer.");
    }
  }
}
