import { Injectable, OnModuleInit, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderFactory } from '../providers/provider.factory';
import { IncomingMessage } from '../interfaces/message-provider.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventsGateway } from '../../gateway/events/events.gateway';

@Injectable()
export class SessionManagerService implements OnModuleInit {
  private readonly logger = new Logger(SessionManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: ProviderFactory,
    @InjectQueue('incoming_messages') private readonly incomingQueue: Queue,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
  ) { }

  async onModuleInit() {
    this.logger.log('Buscando sessões pendentes no banco de dados...');
    const instances = await this.prisma.whatsappInstance.findMany();

    for (const instance of instances) {
      if (instance.status !== 'DISCONNECTED') {
        this.logger.log(`Tentando reconectar instância: ${instance.name} (${instance.id}) via Provider: ${instance.provider}`);
        await this.startSession(instance.id);
      }
    }
  }

  async startSession(instanceId: string) {
    try {
      const provider = await this.providerFactory.getProvider(instanceId);

      // Amarra os eventos pra esta instância específica neste provedor instanciado
      provider.onMessage(this.handleIncomingMessage.bind(this));
      provider.onConnectionStatus(this.handleConnectionStatus.bind(this));

      await provider.connect(instanceId);
    } catch (error) {
      this.logger.error(`Erro ao iniciar sessão ${instanceId}`, error);
    }
  }

  async stopSession(instanceId: string) {
    try {
      const provider = await this.providerFactory.getProvider(instanceId);
      await provider.disconnect(instanceId);
      this.providerFactory.removeProvider(instanceId);
    } catch (err) {
      this.logger.error('Erro ao parar sessão', err);
    }
  }

  async deleteSession(instanceId: string) {
    await this.stopSession(instanceId);
    await this.prisma.whatsappInstance.delete({
      where: { id: instanceId },
    });
  }

  async sendMessage(
    instanceId: string,
    to: string,
    content: string,
    media?: { url: string; type: string; ptt?: boolean },
    interactive?: any,
  ): Promise<any> {
    const provider = await this.providerFactory.getProvider(instanceId);

    // Passa o interactive se existir
    const result = await provider.sendMessage(instanceId, to, content, media, interactive);

    // Emite para o Painel Web
    this.gateway.emit('new_message', {
      instanceId,
      sender: to,
      content,
      fromMe: true,
      timestamp: new Date(),
    });

    return result;
  }

  public async handleIncomingMessage(msg: IncomingMessage) {
    this.logger.log(`[NOVA MSG] Instância: ${msg.instanceId} | De: ${msg.sender} | Enfileirando...`);

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
      this.logger.log(`[QR CODE DISPONÍVEL] Renderize o seguinte payload no Frontend para emparelhar...`);
      this.gateway.emit('qr_code', { instanceId, qrCode });
    }
  }
}
