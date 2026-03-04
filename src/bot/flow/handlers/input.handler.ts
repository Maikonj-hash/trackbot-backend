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
    const value = ctx.msg.content.trim();

    if (step.saveToVariable === 'name') {
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { name: value },
      });
    } else if (step.saveToVariable && step.saveToVariable !== 'phone') {
      // Salva no JSONB Metadata
      const currentMetadata = (ctx.user as any).metadata || {};
      const newMetadata = { ...currentMetadata, [step.saveToVariable]: value };

      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { metadata: newMetadata },
      });
    }

    return step.nextStepId ?? null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as InputStep;

    const content = ctx.variableService.resolve(step.content, {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    await ctx.outgoingQueue.add('send', {
      instanceId: ctx.msg.instanceId,
      to: ctx.msg.sender,
      content,
      delayMs: 1500,
    });

    // Input para a execução passiva e aguarda input do usuário
    return null;
  }
}
