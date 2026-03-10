import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { HandoverStep } from '../types';

@Injectable()
export class HandoverHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'HANDOVER';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as HandoverStep;

    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        status: 'ATTENDANT',
      },
    });

    const resolvedDep = ctx.variableService.resolve(step.department || 'General', {
      user: ctx.user,
      flowDef: ctx.flowDef,
    });

    // Emite no WebSocket para a Dashboard React/Vue pintar o painel do atendente de vermehlo
    // Simulando disparo de aviso:
    // ctx.gateway.emit('handover_requested', { userId: ctx.user.id, instanceId: ctx.msg.instanceId, dep: resolvedDep });

    return null; // O bot PARA e não roda mais blocos
  }
}
