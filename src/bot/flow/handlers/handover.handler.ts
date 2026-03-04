import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { HandoverStep } from '../types';

@Injectable()
export class HandoverHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'HANDOVER';
  }

  // Bloco Passivo (Mas que trava o fluxo conversacional permanentemente até um agente humano intervir)
  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    // Nós bloqueamos a execução natural pq a inteção é ignorar os disparos
    // enquanto o hand_over = true, até a dashboard retornar pra "false"
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as HandoverStep;

    // Atualiza o Prisma informando que aquele número requer um humano
    await ctx.prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        status: 'ATTENDANT', // Criar status logic mais tarde
      },
    });

    // Emite no WebSocket para a Dashboard React/Vue pintar o painel do atendente de vermehlo
    // Simulando disparo de aviso:
    // ctx.gateway.emit('handover_requested', { userId: ctx.user.id, instanceId: ctx.msg.instanceId, dep: step.department });

    return null; // O bot PARA e não roda mais blocos
  }
}
