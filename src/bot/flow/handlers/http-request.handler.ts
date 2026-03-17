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

        // Smart JSON Detection: Se a string resolvida parece um JSON, convertemos para objeto
        // Isso garante que o body final enviado pelo fetch (via JSON.stringify lá embaixo) seja íntegro.
        try {
          if (typeof body === 'string' && (body.trim().startsWith('{') || body.trim().startsWith('['))) {
            const parsed = JSON.parse(body);
            body = parsed;
          }
        } catch (e) {
          // Mantém como string se não for um JSON válido
        }
      }

      const timeout = step.timeout || 15000; // Aumentado para 15s para garantir
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

      // Processamento de Metadados Centralizado
      await this.persistMetadata(ctx, step, responseStatus, responseData);

      // Definição de Próximo Passo com Proteção contra Limbo
      if (responseStatus >= 200 && responseStatus < 300) {
        return await this.getNextStep(ctx, step.successStepId || step.nextStepId);
      } else {
        return await this.getNextStep(ctx, step.failureStepId || step.nextStepId);
      }
    } catch (error) {
      this.logger.error(`[HTTP REQUEST FAILED] ${step.url}`, error);

      // Em erro, tenta salvar status 500 se configurado
      await this.persistMetadata(ctx, step, 500, { error: error.message });

      return await this.getNextStep(ctx, step.failureStepId || step.nextStepId);
    }
  }

  /**
   * Resolve o próximo passo e limpa o estado caso seja um nó terminal (Fim do fluxo).
   */
  private async getNextStep(ctx: StepHandlerContext, targetId: string | null | undefined): Promise<string | null> {
    const nextId = targetId || null;
    if (!nextId) {
      this.logger.log(`[HTTP HANDLER] Nó terminal atingido (${ctx.step.type}). Finalizando atendimento para ${ctx.userPhone}.`);
      await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.userPhone);
    }
    return nextId;
  }

  /**
   * Centraliza a persistência de status, resposta e mapeamento de campos no banco.
   */
  private async persistMetadata(ctx: StepHandlerContext, step: HttpRequestStep, status: number, data: any) {
    const metadataUpdates: any = {};

    // 1. Status da Resposta
    if (step.saveStatusToVariable?.trim()) {
      metadataUpdates[step.saveStatusToVariable.trim().toLowerCase()] = status;
    }

    // 2. Resposta Completa
    if (step.saveResponseToVariable?.trim()) {
      metadataUpdates[step.saveResponseToVariable.trim().toLowerCase()] = data;
    }

    // 3. Mapeamento de Campos Específicos (JSON Path)
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

    if (Object.keys(metadataUpdates).length > 0) {
      const currentMetadata = (ctx.user as any).metadata || {};
      await ctx.prisma.user.update({
        where: { id: ctx.user.id },
        data: { metadata: { ...currentMetadata, ...metadataUpdates } },
      });
    }
  }
}
