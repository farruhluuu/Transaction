import { IsInt, IsPositive } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTransactionDto {
  @IsInt({ message: 'senderId должен быть целым числом' })
  senderId: number

  @IsInt({ message: 'receiverId должен быть целым числом' })
  receiverId: number

  @Transform(({ value }) => parseFloat(value))
  @IsPositive({ message: 'amount должен быть положительным числом' })
  amount: number
}
