import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { TextStep } from '../types';

@Injectable()
export class TextHandler implements IStepHandler {
  private readonly logger = new Logger(TextHandler.name);

  canHandle(type: string): boolean {
    return type === 'TEXT';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as TextStep;
    // O Bloco TEXT geralmente não aguarda input específico de validação
    // Qualquer coisa que o usuário falar irá jogar pro próximo passo
    return step.nextStepId ?? null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as TextStep;

    const content = ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content,
      delayMs: 1500, // Delay padrão global
    });

    // Se tiver nextStepId, já encadeia silenciosamente pro próximo bloco
    return step.nextStepId ?? null;
  }
}
