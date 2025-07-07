import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { OptimisticStrategy } from './stategy/optimistic.transaction';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly optimisticService: OptimisticStrategy) {}

  @Post('transfer/optimistic')
  async transferOptimistic(@Body() dto: CreateTransactionDto) {
    try {
      const result = await this.optimisticService.handle(dto)
      return { success: true, data: result }
    } catch (error) {
      throw new BadRequestException(error.message)
    }
  }
}
