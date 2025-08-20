import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from './admin.service';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly configService: ConfigService,
  ) { }

  @Get('transaction')
  @ApiOperation({
    summary: 'Получить историю всех транзакций',
    description:
      'Возвращает список всех транзакций в системе. ' +
      'Доступно только администраторам.',
  })
  @ApiResponse({
    status: 200,
    description: 'История транзакций успешно получена',
    schema: {
      example: [
        {
          id: 1,
          fromUserId: 1,
          toUserId: 2,
          amount: 500,
          status: 'SUCCESS',
          createdAt: '2025-08-10T12:00:00.000Z',
        },
        {
          id: 2,
          fromUserId: 3,
          toUserId: 4,
          amount: 1000,
          status: 'FAILED',
          createdAt: '2025-08-10T13:00:00.000Z',
        },
      ],
    },
  })
  async Transactions() {
    return this.adminService.findAll();
  }

  @Get('strategy')
  @ApiOperation({
    summary: 'Получить текущую стратегию транзакций',
    description:
      'Возвращает стратегию обработки транзакций, установленную в настройках сервиса (через ENV).',
  })
  @ApiResponse({
    status: 200,
    description: 'Текущая стратегия успешно получена',
    schema: {
      example: {
        strategy: 'Текущая стратегия транзакций: PESSIMISTIC',
      },
    },
  })
  getTransactionStrategy() {
    const strategy = this.configService.get('TRANSACTION_STRATEGY');
    return { strategy: `Текущая стратегия транзакций: ${strategy}` };
  }


  @Get('transaction/history')
  @ApiOperation({ summary: 'Получить историю транзакций пользователя за дату' })
  @ApiQuery({ name: 'userId', type: String, description: 'ID пользователя', required: true })
  @ApiQuery({ name: 'date', type: String, description: 'Дата в формате YYYY-MM-DD', required: false })
  async getTransactionHistory(
    @Query('userId') userId: string,
    @Query('date') date?: string,
  ) {
    return this.adminService.getTransactionHistory(userId, date);
  }

}