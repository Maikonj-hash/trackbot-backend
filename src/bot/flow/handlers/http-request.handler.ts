import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { HttpRequestStep } from '../types';

@Injectable()
export class HttpRequestHandler implements IStepHandler {
  private readonly logger = new Logger(HttpRequestHandler.name);

  canHandle(type: string): boolean {
    return type === 'HTTP_REQUEST' || type === 'TRACK_DESK';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null;
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as HttpRequestStep;
    let responseStatus: number | null = null;
    let responseData: any = {};

    try {
      const resolvedUrl = await ctx.variableService.resolve(step.url, {
        user: ctx.user,
        flowDef: ctx.flowDef,
      });

      this.logger.log(`[HTTP REQUEST] Disparando ${step.method} para ${resolvedUrl}`);

      if (!resolvedUrl || !resolvedUrl.startsWith('http')) {
        throw new Error(`URL Inválida ou não resolvida: ${resolvedUrl}`);
      }

      const rawHeaders = step.headers || {};
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      for (const [key, value] of Object.entries(rawHeaders)) {
        requestHeaders[key] = await ctx.variableService.resolve(String(value), {
          user: ctx.user,
          flowDef: ctx.flowDef,
        });
      }

      let body: any = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(step.method) && step.bodyPayload) {
        const bodyContent = typeof step.bodyPayload === 'string'
          ? step.bodyPayload
          : JSON.stringify(step.bodyPayload);

        body = await ctx.variableService.resolve(bodyContent, {
          user: ctx.user,
          flowDef: ctx.flowDef,
        });

        try {
          if (typeof body === 'string' && (body.trim().startsWith('{') || body.trim().startsWith('['))) {
            const parsed = JSON.parse(body);
            body = parsed;
          }

          if (typeof body === 'object' && step.type === 'TRACK_DESK') {
            Object.keys(body).forEach(key => {
              if (body[key] === "") delete body[key];
            });
            this.logger.log(`[TRACK-DESK] Payload Sanitizado: ${JSON.stringify(body)}`);
          }
        } catch (e) {
        }
      }

      const timeout = step.timeout || 15000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(resolvedUrl, {
        method: step.method,
        headers: requestHeaders,
        body: typeof body === 'object' ? JSON.stringify(body) : body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      responseStatus = response.status;
      const responseText = await response.text().catch(() => '');
      try {
        responseData = JSON.parse(responseText);
      } catch (err) {
        responseData = responseText;
      }

      this.logger.log(`[HTTP RESPONSE] Status: ${responseStatus}`);

      await this.persistMetadata(ctx, step, responseStatus, responseData);

      if (responseStatus >= 200 && responseStatus < 300) {
        return await this.getNextStep(ctx, step.successStepId || step.nextStepId);
      } else {
        return await this.getNextStep(ctx, step.failureStepId || step.nextStepId);
      }
    } catch (error) {
      this.logger.error(`[HTTP REQUEST FAILED] ${step.url}`, error);

      await this.persistMetadata(ctx, step, 500, { error: error.message });

      if ((step as any).errorFallbackMessage) {
        await ctx.outgoingQueue.add('send', {
          instanceId: ctx.msg.instanceId,
          to: ctx.userPhone,
          content: (step as any).errorFallbackMessage,
          delayMs: 500,
        });
      }

      return await this.getNextStep(ctx, step.failureStepId || step.nextStepId);
    }
  }

  private async getNextStep(ctx: StepHandlerContext, targetId: string | null | undefined): Promise<string | null> {
    const nextId = targetId || null;
    if (!nextId) {
      this.logger.log(`[HTTP HANDLER] Nó terminal atingido (${ctx.step.type}). Finalizando atendimento para ${ctx.userPhone}.`);
      await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.userPhone);
    }
    return nextId;
  }

  private async persistMetadata(ctx: StepHandlerContext, step: HttpRequestStep, status: number, data: any) {
    const metadataUpdates: any = {};
    if (step.saveStatusToVariable?.trim()) {
      metadataUpdates[step.saveStatusToVariable.trim().toLowerCase()] = status;
    }

    if (step.saveResponseToVariable?.trim()) {
      metadataUpdates[step.saveResponseToVariable.trim().toLowerCase()] = data;
    }

    if (step.responseMapping && Array.isArray(step.responseMapping)) {
      for (const mapping of step.responseMapping) {
        if (mapping.jsonPath && mapping.variableName?.trim()) {
          const value = ctx.variableService.getDeepValue(data, mapping.jsonPath);
          if (value !== undefined) {
            metadataUpdates[mapping.variableName.trim().toLowerCase()] = value;
          }
        }
      }
    }

    if (Object.keys(metadataUpdates).length > 0 || status !== undefined) {
      const currentMetadata = (ctx.user as any).metadata || {};

      if (status !== undefined) {
        metadataUpdates['sys.last_http_status'] = status;
        if (status >= 400) {
          metadataUpdates['sys.last_http_error'] = data?.error || data?.message || "Erro desconhecido";
        } else {
          metadataUpdates['sys.last_http_error'] = null;
        }

        const currentProtocol = await ctx.variableService.get(ctx.user, 'sys.protocol', ctx.flowDef);
        if (currentProtocol && !currentMetadata['sys.protocol']) {
          metadataUpdates['sys.protocol'] = currentProtocol;
        }
      }

      const hasChanges = Object.entries(metadataUpdates).some(([key, value]) => {
        return JSON.stringify(currentMetadata[key]) !== JSON.stringify(value);
      });

      if (hasChanges) {
        const finalMetadata = { ...currentMetadata, ...metadataUpdates };
        await ctx.prisma.user.update({
          where: { id: ctx.user.id },
          data: { metadata: finalMetadata },
        });
        (ctx.user as any).metadata = finalMetadata;
      }
    }
  }
}
