import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { OptionsStep } from '../types';

@Injectable()
export class OptionsHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'OPTIONS';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as OptionsStep;
    const option = ctx.msg.content.trim();

    if (step.options && step.options[option]) {
      // Input válido
      return step.options[option];
    }

    // Input inválido, responde erro e retorna null (fica travado nesse step)
    const resolvedContent = ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: 'Opção inválida, tenta novamente:\n\n' + resolvedContent,
      delayMs: 1000,
    });
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as OptionsStep;

    const resolvedContent = ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: resolvedContent,
      delayMs: 1500,
    });

    // O Options SEMPRE para aqui aguardando o usuário digitar um número.
    // Portanto a execução em loop morre retornando null.
    return null;
  }
}
