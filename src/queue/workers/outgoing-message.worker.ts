import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { SessionManagerService } from '../../whatsapp/session-manager/session-manager.service';

export interface OutgoingMessageJob {
  instanceId: string;
  to: string;
  content: string;
  delayMs?: number; // Para simular tempo de digitação humana
  mediaUrl?: string;
  mediaType?: string; // audio, video, image, document
  ptt?: boolean;
}

@Processor('outgoing_messages', {
  concurrency: 5, // Processa estritamente até 5 envios paralelos no máximo para não dar flag no zap
  limiter: {
    max: 10,
    duration: 1000,
  },
})
export class OutgoingMessageWorker extends WorkerHost {
  private readonly logger = new Logger(OutgoingMessageWorker.name);

  constructor(
    @Inject(forwardRef(() => SessionManagerService))
    private readonly sessionManager: SessionManagerService,
  ) {
    super();
  }

  async process(job: Job<OutgoingMessageJob, any, string>): Promise<any> {
    const data = job.data;
    this.logger.log(
      `📤 Enviando resposta para [${data.to}]: ${data.content.substring(0, 30)}`,
    );

    const { instanceId, to, content, delayMs, mediaUrl, mediaType, ptt } =
      job.data;

    // Simula a demora de um ser humano para evitar ban
    if (delayMs) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const media =
      mediaUrl && mediaType
        ? { url: mediaUrl, type: mediaType, ptt }
        : undefined;

    await this.sessionManager.sendMessage(instanceId, to, content, media);
    return { success: true };
  }
}
