import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BaileysProvider } from '../providers/baileys.provider';
import { IncomingMessage } from '../interfaces/message-provider.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventsGateway } from '../../gateway/events/events.gateway';
import { forwardRef, Inject } from '@nestjs/common';

@Injectable()
export class SessionManagerService implements OnModuleInit {
  private readonly logger = new Logger(SessionManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messageProvider: BaileysProvider,
    @InjectQueue('incoming_messages') private readonly incomingQueue: Queue,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.messageProvider.onMessage(this.handleIncomingMessage.bind(this));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    this.messageProvider.onConnectionStatus(
      this.handleConnectionStatus.bind(this),
    );
  }

  async onModuleInit() {
    this.logger.log('Buscando sessões pendentes no banco de dados...');
    const instances = await this.prisma.whatsappInstance.findMany();

    for (const instance of instances) {
      if (instance.status !== 'DISCONNECTED') {
        this.logger.log(
          `Tentando reconectar instância: ${instance.name} (${instance.id})`,
        );
        await this.startSession(instance.id);
      }
    }
  }

  async startSession(instanceId: string) {
    try {
      await this.messageProvider.connect(instanceId);
    } catch (error) {
      this.logger.error(`Erro ao iniciar sessão ${instanceId}`, error);
    }
  }

  async stopSession(instanceId: string) {
    // Apenas desloga do WhatsApp Web e limpa o cache local
    await this.messageProvider.disconnect(instanceId);
  }

  async deleteSession(instanceId: string) {
    // 1. Desconecta o Bot e limpa lixo da pasta '.sessions'
    await this.stopSession(instanceId);

    // 2. Remove o registro mestre do Postgres
    await this.prisma.whatsappInstance.delete({
      where: { id: instanceId },
    });
  }

  async sendMessage(
    instanceId: string,
    to: string,
    content: string,
    media?: { url: string; type: string; ptt?: boolean },
  ): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.messageProvider.sendMessage(
      instanceId,
      to,
      content,
      media,
    );

    // [SAAS] Emite para o Painel Web (Atendente Humano) que o robô (ou admin) enviou essa mensagem pra renderizar o balãozinho verde.
    this.gateway.emit('new_message', {
      instanceId,
      sender: to, // Pra quem foi a mensagem
      content,
      fromMe: true, // Informamos à Tela que esta veio do nosso lado (Verde)
      timestamp: new Date(),
    });

    return result;
  }

  private async handleIncomingMessage(msg: IncomingMessage) {
    this.logger.log(
      `[NOVA MSG] Instância: ${msg.instanceId} | De: ${msg.sender} | Enfileirando...`,
    );

    // [SAAS] Emite pro Navegador Frontend / App renderizar balão branco sem precisar recarregar a tela
    this.gateway.emit('new_message', {
      instanceId: msg.instanceId,
      sender: msg.sender,
      content: msg.content,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
    });

    await this.incomingQueue.add('receive', msg, { removeOnComplete: true });
  }

  private handleConnectionStatus(
    instanceId: string,
    status: string,
    qrCode?: string,
  ) {
    this.logger.log(`[STATUS SESSÃO] ${instanceId} - ${status}`);
    this.gateway.emit('session_status', { instanceId, status });

    if (qrCode) {
      this.logger.log(
        `[QR CODE DISPONÍVEL] Renderize o seguinte payload no Frontend para emparelhar: ${qrCode.substring(0, 30)}...`,
      );
      this.gateway.emit('qr_code', { instanceId, qrCode });
    }
  }
}
