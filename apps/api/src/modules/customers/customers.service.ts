import { Injectable } from "@nestjs/common";
import { CustomersRepository } from "./repositories/customers.repository";
import { CreateCustomerDto } from "./dto/create-customer.dto";

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepo: CustomersRepository) {}

  list(organizationId: string) {
    return this.customersRepo.findManyByOrg(organizationId);
  }

  create(organizationId: string, dto: CreateCustomerDto) {
    return this.customersRepo.create({
      organization: { connect: { id: organizationId } },
      name: dto.name,
      phone: dto.phone,
      whatsappPhone: dto.whatsappPhone
    });
  }
}
