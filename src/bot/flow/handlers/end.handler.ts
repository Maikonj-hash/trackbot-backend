import { Injectable } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';

@Injectable()
export class EndHandler implements IStepHandler {
  canHandle(type: string): boolean {
    return type === 'END';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.user.phone);
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as any;

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
    } else {
      await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.user.phone);
    }

    return null;
  }
}
