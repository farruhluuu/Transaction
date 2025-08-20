import { 
  Controller, 
  Post, 
  Body, 
  ValidationPipe 
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Transactions') 
@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('transfer')
  @ApiOperation({
    summary: 'Перевод средств между пользователями',
    description:
      'Создаёт транзакцию перевода средств от одного пользователя к другому. ' +
      'При успешном выполнении возвращает информацию о проведённой транзакции.',
  })
  @ApiBody({
    description: 'Данные для создания перевода',
    type: CreateTransactionDto,
    examples: {
      example1: {
        summary: 'Пример перевода',
        value: {
          fromUserId: 1,
          toUserId: 2,
          amount: 500,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Перевод успешно выполнен',
    schema: {
      example: {
        id: 123,
        fromUserId: 1,
        toUserId: 2,
        amount: 500,
        status: 'SUCCESS',
        createdAt: '2025-08-10T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректные данные для перевода или недостаточно средств',
  })
  async transfer(
    @Body(new ValidationPipe()) createTransactionDto: CreateTransactionDto,
  ) {
    return this.transactionService.transfer(createTransactionDto);
  }
}
