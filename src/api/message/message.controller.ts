import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { MessageService } from './message.service';

@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get('user/:userId')
  getHistoryByUser(@Param('userId') userId: string) {
    return this.messageService.getHistoryByUserRange(userId);
  }

  @Get('phone/:phone')
  getHistoryByPhone(@Param('phone') phone: string) {
    return this.messageService.getHistoryByPhone(phone);
  }

  @Post('send')
  async sendMessage(
    @Body()
    data: {
      instanceId: string;
      to: string;
      content: string;
      media?: { url: string; type: string; ptt?: boolean };
    },
  ) {
    return this.messageService.sendMessage(data);
  }
}
