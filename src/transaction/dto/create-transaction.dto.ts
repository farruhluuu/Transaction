import { IsInt, IsPositive } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransactionDto {
  @ApiProperty({
    example: 1,
    description: 'ID пользователя, который отправляет средства',
  })
  @IsInt({ message: 'senderId должен быть целым числом' })
  senderId: number;

  @ApiProperty({
    example: 2,
    description: 'ID пользователя, который получает средства',
  })
  @IsInt({ message: 'receiverId должен быть целым числом' })
  receiverId: number;

  @ApiProperty({
    example: 500.5,
    description: 'Сумма перевода (должна быть положительным числом)',
  })
  @Transform(({ value }) => parseFloat(value))
  @IsPositive({ message: 'amount должен быть положительным числом' })
  amount: number;
}
