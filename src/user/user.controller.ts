import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id/balance')
  getBalance(@Param('id') id: number) {
    return this.userService.getBalance(Number(id))
  }

}
