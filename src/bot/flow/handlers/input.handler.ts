import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { InputStep } from '../types';

@Injectable()
export class InputHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'INPUT';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as InputStep;

    // Salva a variavel dinamicamente no Prisma (JSON metadata)
    // Para fins do exemplo, se for 'name', salva nativo, senão num JSONB
    const value = ctx.msg.content.trim();

    if (step.saveToVariable === 'name') {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { name: value },
      });
    } else if (step.saveToVariable === 'phone') {
      // Ignora phone pq é primary key
    } else {
      // Seria Metadata JSON
    }

    return step.nextStepId ?? null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as InputStep;

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content: step.content,
      delayMs: 1500,
    });

    // Input para a execução passiva e aguarda input do usuário
    return null;
  }
}
