import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { MediaStep } from '../types';

@Injectable()
export class MediaHandler implements IStepHandler {
  private readonly logger = new Logger(MediaHandler.name);

  canHandle(type: string): boolean {
    return type === 'MEDIA';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null; // O bloco de mídia, assim como texto, passa direto
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as MediaStep;

    // No Typebot, o envio de midia so precisa de uma URL.
    // Iremos delegar pro Worker Outgoing a flag 'mediaData' para o provider disparar apropriadamente.
    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: step.caption || '',
      mediaUrl: step.url,
      mediaType: step.mediaType,
      ptt: step.ptt,
      delayMs: 2500, // Midias demoram mais pra "carregar", botamos + delay
    });

    return step.nextStepId ?? null;
  }
}
