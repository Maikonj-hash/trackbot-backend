import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionManagerService } from '../../whatsapp/session-manager/session-manager.service';

@Injectable()
export class MessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: SessionManagerService,
  ) {}

  async getHistoryByUserRange(userId: string) {
    return this.prisma.messageHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getHistoryByPhone(phone: string) {
    const user = await this.prisma.user.findUnique({
      where: { phone },
    });
    if (!user) return [];

    return this.prisma.messageHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sendMessage(data: {
    instanceId: string;
    to: string; // Ex: 551199999999
    content: string;
    media?: { url: string; type: string; ptt?: boolean };
  }) {
    // Como sendMessage do SessionManager joga direto pro socket/fila
    // e o próprio Worker interceptará e salvará no banco (ou salva direto lá)
    await this.sessionManager.sendMessage(
      data.instanceId,
      data.to,
      data.content,
      data.media,
    );
    return { success: true, message: 'Message sent / queued.' };
  }
}
