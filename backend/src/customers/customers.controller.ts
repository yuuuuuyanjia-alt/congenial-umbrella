import { Controller, Get, Param } from '@nestjs/common';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list() {
    return this.customers.list();
  }

  @Get(':id/evaluation')
  evaluate(@Param('id') id: string) {
    return this.customers.evaluateBuyer(id);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }
}
