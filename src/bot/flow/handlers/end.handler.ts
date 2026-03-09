import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';

@Injectable()
export class EndHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'END';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    // Se o usuário mandar algo enquanto está no bloco END, o FlowService vai decidir se reinicia ou ignora.
    // Mas como redundância, se chegou aqui, limpamos.
    await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.user.phone);
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as any; // Cast para evitar erro de tipo se o build for lento
    
    if (step.resetType === 'TIMEOUT' && step.timeoutValue) {
      const expiresAt = new Date(Date.now() + step.timeoutValue * 60 * 1000);
      
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: {
          metadata: {
            ...(ctx.user.metadata as any || {}),
            flow_expires_at: expiresAt.toISOString()
          }
        }
      });
      
      // No modo TIMEOUT, mantemos o usuário logado no passo END.
      // O FlowService se encarregará de limpar quando o tempo expirar.
    } else {
      // Modo IMMEDIATE (Padrão): Limpa imediatamente o estado do usuário.
      await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.user.phone);
    }
    
    return null;
  }
}
