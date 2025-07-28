import { 
  Controller, 
  Post, 
  Body, 
  ValidationPipe 
} from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Controller('transactions') 
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}
  @Post('transfer') 
  
  async transfer(
    @Body(new ValidationPipe()) createTransactionDto: CreateTransactionDto,
  ) {
    return this.transactionService.transfer(createTransactionDto);
  }
}
