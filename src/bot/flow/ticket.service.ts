import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { User } from '@prisma/client';
import { FlowDefinition } from './types';
import { VariableService } from './variable.service';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly variableService: VariableService,
  ) {}

  async createFromFlow(user: User, flowDef?: FlowDefinition) {
    try {
      this.logger.log(`[TicketService] Gerando ticket para usuário ${user.phone}`);

      const payloadRaw = await this.variableService.get(user, 'sys.payload', flowDef);
      
      let payload: any;
      try {
        payload = JSON.parse(payloadRaw);
      } catch (e) {
        this.logger.error(`[TicketService] Erro ao parsear sys.payload: ${e.message}`);
        return null;
      }

      const ticket = await (this.prisma as any).ticket.create({
        data: {
          userId: user.id,
          flowId: payload.ticket?.flowId || 'unknown',
          flowName: payload.ticket?.flowName || 'unknown',
          protocol: payload.ticket?.protocol || null,
          content: payload,
        },
      });

      this.logger.log(`[TicketService] Ticket criado com sucesso: ${ticket.id} | Protocolo: ${ticket.protocol}`);
      return ticket;
    } catch (error) {
      this.logger.error(`[TicketService] Falha crítica ao criar ticket: ${error.message}`, error.stack);
      return null;
    }
  }

  async getByUser(userId: string) {
    return (this.prisma as any).ticket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
