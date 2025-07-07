import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService
  ) {}

  @Get('transaction')
  async Transactions() {
    return this.adminService.findAll()
  }

  @Get('strategy')
  getTransactionStrategy() {
    const strategy = this.configService.get('TRANSACTION_STRATEGY')
    return { strategy: `Текущая стратегия транзакций: ${strategy}` }
  }
}
