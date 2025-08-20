import { Controller, Get, Param } from '@nestjs/common';
import { UserService } from './user.service';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';

@ApiTags('User') // Группировка эндпоинтов в Swagger по тегу "User"
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id/balance')
  @ApiOperation({
    summary: 'Получить баланс пользователя',
    description:
      'Возвращает текущий баланс пользователя по его ID. Если пользователь не найден — будет ошибка.',
  })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID пользователя, баланс которого нужно получить',
    example: 42,
  })
  @ApiResponse({
    status: 200,
    description: 'Баланс пользователя успешно получен',
    schema: {
      example: { balance: 1500 },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Пользователь не найден',
  })
  getBalance(@Param('id') id: number) {
    return this.userService.getBalance(Number(id));
  }
}
