import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { HttpRequestStep } from '../types';

@Injectable()
export class HttpRequestHandler implements IStepHandler {
  private readonly logger = new Logger(HttpRequestHandler.name);

  canHandle(type: string): boolean {
    return type === 'HTTP_REQUEST';
  }

  async processInput(ctx: StepHandlerContext): Promise<string | null> {
    return null; // O bloco roda passivamente assim que é acessado
  }

  async executeStep(ctx: StepHandlerContext): Promise<string | null> {
    const step = ctx.step as HttpRequestStep;
    let responseStatus: number | null = null;
    let responseData: any = {};

    try {
      // 1. Interpolar URL
      const url = ctx.variableService.resolve(step.url, {
        user: ctx.user,
        flowDef: ctx.flowDef,
      });

      this.logger.log(`[HTTP REQUEST] Disparando ${step.method} para ${url}`);

      // 2. Interpolar Headers
      const rawHeaders = step.headers || {};
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      for (const [key, value] of Object.entries(rawHeaders)) {
        requestHeaders[key] = ctx.variableService.resolve(String(value), {
          user: ctx.user,
          flowDef: ctx.flowDef,
        });
      }

      // 3. Interpolar Body (se houver)
      let body: any = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(step.method) && step.bodyPayload) {
        const bodyContent = typeof step.bodyPayload === 'string'
          ? step.bodyPayload
          : JSON.stringify(step.bodyPayload);

        body = ctx.variableService.resolve(bodyContent, {
          user: ctx.user,
          flowDef: ctx.flowDef,
        });
      }

      // 4. Timeout (Default 10s se não especificado)
      const timeout = step.timeout || 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // 5. Disparo
      const response = await fetch(url, {
        method: step.method,
        headers: requestHeaders,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      responseStatus = response.status;
      const responseText = await response.text().catch(() => '');
      try {
        responseData = JSON.parse(responseText);
      } catch (err) {
        responseData = responseText; // Fallback para texto bruto se não for JSON
      }

      this.logger.log(`[HTTP RESPONSE] Status: ${responseStatus}`);

      // 6. Persistência de Dados
      let metadataUpdates: any = {};

      if (step.saveStatusToVariable) {
        metadataUpdates[step.saveStatusToVariable] = responseStatus;
      }

      if (step.saveResponseToVariable) {
        metadataUpdates[step.saveResponseToVariable] = responseData;
      }

      if (step.responseMapping && Array.isArray(step.responseMapping)) {
        for (const mapping of step.responseMapping) {
          const value = this.getDeepValue(responseData, mapping.jsonPath);
          if (value !== undefined) {
            metadataUpdates[mapping.variableName] = value;
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

      // 7. Roteamento
      if (responseStatus >= 200 && responseStatus < 300) {
        return step.successStepId || step.nextStepId || null;
      } else {
        return step.failureStepId || step.nextStepId || null;
      }
    } catch (error) {
      this.logger.error(`[HTTP REQUEST FAILED] ${step.url}`, error);

      if (step.saveStatusToVariable) {
        const currentMetadata = (ctx.user as any).metadata || {};
        await ctx.prisma.user.update({
          where: { id: ctx.user.id },
          data: { metadata: { ...currentMetadata, [step.saveStatusToVariable]: 500 } },
        });
      }

      return step.failureStepId || step.nextStepId || null;
    }
  }

  private getDeepValue(obj: any, path: string): any {
    if (!obj || !path) return undefined;
    return path.split('.').reduce((prev, curr) => {
      return prev ? prev[curr] : undefined;
    }, obj);
  }
}
