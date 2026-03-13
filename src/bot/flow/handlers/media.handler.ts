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
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as MediaStep;

    const resolvedUrl = await ctx.variableService.resolve(step.url, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    const resolvedCaption = await ctx.variableService.resolve(step.caption || '', {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: resolvedCaption,
      mediaUrl: resolvedUrl,
      mediaType: step.mediaType,
      ptt: step.ptt,
      delayMs: 2500,
    });

    // Registro de Jornada (Interação - Envio de Mídia)
    await ctx.stateService.pushJourney(ctx.msg.instanceId, ctx.userPhone, {
      type: 'INTERACTION',
      nodeId: step.id,
      nodeType: step.type,
      label: `Mídia: ${step.mediaType}`,
      value: resolvedUrl.split('/').pop() || step.mediaType,
      timestamp: new Date().toISOString(),
    });

    return step.nextStepId ?? null;
  }
}
