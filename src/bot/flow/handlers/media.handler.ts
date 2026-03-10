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

    const resolvedUrl = ctx.variableService.resolve(step.url, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    const resolvedCaption = ctx.variableService.resolve(step.caption || '', {
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

    return step.nextStepId ?? null;
  }
}
