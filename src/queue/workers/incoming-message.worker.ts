import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { IncomingMessage } from '../../whatsapp/interfaces/message-provider.interface';
import { FlowService } from '../../bot/flow/flow.service';

@Processor('incoming_messages')
export class IncomingMessageWorker extends WorkerHost {
  private readonly logger = new Logger(IncomingMessageWorker.name);

  constructor(
    @Inject(forwardRef(() => FlowService))
    private readonly flowService: FlowService,
  ) {
    super();
  }

  async process(job: Job<IncomingMessage, any, string>): Promise<any> {
    const msg = job.data;
    this.logger.log(
      `📥 Processando recebimento de [${msg.sender}]: ${msg.content.substring(0, 30)}...`,
    );

    await this.flowService.processMessage(msg);
    return { success: true };
  }
}
