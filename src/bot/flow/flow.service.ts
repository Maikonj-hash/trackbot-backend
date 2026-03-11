import { Injectable, Logger } from '@nestjs/common';
import { StateService } from '../state/state.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IncomingMessage } from '../../whatsapp/interfaces/message-provider.interface';
import { HandlerFactory } from './handlers/handler.factory';
import { StepHandlerContext } from './handlers/handler.interface';
import { VariableService } from './variable.service';
import { AnyFlowStep, FlowDefinition } from './types';
import * as fs from 'fs';
import * as path from 'path';

const MAX_STEPS_PER_MESSAGE = 20;

@Injectable()
export class FlowService {
  private readonly logger = new Logger(FlowService.name);
  private flows: Map<string, FlowDefinition> = new Map();

  constructor(
    private readonly stateService: StateService,
    private readonly prisma: PrismaService,
    private readonly handlerFactory: HandlerFactory,
    private readonly variableService: VariableService,
    @InjectQueue('outgoing_messages') private readonly outgoingQueue: Queue,
  ) { }

  async invalidateCache(flowId: string, instanceId?: string) {
    this.flows.delete(flowId);
    this.logger.log(`Cache invalidated for flow: ${flowId}`);

    if (instanceId) {
      await this.stateService.clearFlowSessions(instanceId);
      this.logger.log(`Active sessions cleared for instance: ${instanceId}`);
    }
  }

  private async fetchFlowDefinition(flowId: string): Promise<FlowDefinition> {
    if (this.flows.has(flowId)) return this.flows.get(flowId)!;

    try {
      const dbFlow = await this.prisma.flow.findUnique({
        where: { id: flowId },
      });

      if (dbFlow && (dbFlow as any).publishedContent) {
        const json = (dbFlow as any).publishedContent as any;
        const flowDef = json as FlowDefinition;
        this.flows.set(flowId, flowDef);
        return flowDef;
      }

      this.logger.warn(`Flow ${flowId} not found in database or has no published content.`);
      return { id: 'error', name: 'Invalid Flow', steps: {} };
    } catch (e) {
      this.logger.error(`Critical failure loading flow for ${flowId}`, e);
      return { id: 'error', name: 'Critical Error', steps: {} };
    }
  }

  async processMessage(msg: IncomingMessage) {
    if (!msg.content) return;
    const phone = msg.sender.split('@')[0];

    try {
      let user = await this.prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await this.prisma.user.create({
          data: {
            phone,
            instanceId: msg.instanceId
          }
        });
      }

      await this.prisma.messageHistory.create({
        data: {
          userId: user.id,
          content: msg.content,
          fromMe: false,
          instanceId: msg.instanceId
        },
      });

      const instance = await this.prisma.whatsappInstance.findUnique({
        where: { id: msg.instanceId },
      });

      if (!instance?.flowId) {
        this.logger.log(`[PASSIVE MODE] Instance ${instance?.name || msg.instanceId} has no flow associated. Ignoring message from ${phone}.`);
        return;
      }

      const flowId = instance.flowId;
      const flowDef = await this.fetchFlowDefinition(flowId);

      if (flowDef.id === 'error') return;

      let currentStepId = await this.stateService.getStep(
        msg.instanceId,
        phone,
      );

      if (currentStepId) {
        const step = flowDef.steps[currentStepId];
        if (step?.type === 'END') {
          const metadata = (user as any).metadata || {};
          const expiresAtStr = metadata.flow_expires_at;

          if (expiresAtStr) {
            const expiresAt = new Date(expiresAtStr);
            if (new Date() < expiresAt) {
              this.logger.log(`[FLOW TIMEOUT] User ${phone} is still in block timeout at END. Ignoring.`);
              return;
            }
          }

          await this.stateService.clearStep(msg.instanceId, phone);
          currentStepId = null;
        }
      }

      const normalizedInput = msg.content.trim().toLowerCase();
      if (normalizedInput === '0' || normalizedInput === 'voltar') {
        const currentStep = currentStepId ? flowDef.steps[currentStepId] : null;

        if (currentStep?.allowBack) {
          const previousStepId = await this.stateService.popHistory(msg.instanceId, phone);
          if (previousStepId) {
            this.logger.log(`[BACK] User ${phone} requested to go back to ${previousStepId}`);
            const ctx: StepHandlerContext = {
              msg,
              user,
              userPhone: phone,
              step: null as any,
              flowDef,
              stateService: this.stateService,
              variableService: this.variableService,
              outgoingQueue: this.outgoingQueue,
              prisma: this.prisma,
            };
            await this.executeStepChain(previousStepId, ctx);
            return;
          }
        }
      }

      const ctx: StepHandlerContext = {
        msg,
        user,
        userPhone: phone,
        step: null as any,
        flowDef,
        stateService: this.stateService,
        variableService: this.variableService,
        outgoingQueue: this.outgoingQueue,
        prisma: this.prisma,
      };

      if (!currentStepId) {
        const startStepId = flowDef.firstStepId || (user.name ? 'MENU_PRINCIPAL' : 'INITIAL');
        await this.executeStepChain(startStepId, ctx);
        return;
      }

      const currentStep = flowDef.steps[currentStepId];
      if (!currentStep) {
        this.logger.warn(`Step ${currentStepId} not found in flow ${flowId}. Restarting flow for ${phone}.`);
        await this.stateService.clearStep(msg.instanceId, phone);
        const startStepId = flowDef.firstStepId || (user.name ? 'MENU_PRINCIPAL' : 'INITIAL');
        await this.executeStepChain(startStepId, ctx);
        return;
      }

      ctx.step = currentStep;
      const handler = this.handlerFactory.getHandler(currentStep.type);

      if (!handler) {
        this.logger.error(
          `No handler defined for step type ${currentStep.type}`,
        );
        return;
      }

      const nextStepId = await handler.processInput(ctx);

      if (nextStepId) {
        await this.executeStepChain(nextStepId, ctx);
      }
    } catch (error) {
      this.logger.error(
        `Critical Error during processMessage for ${phone}:`,
        error,
      );
    }
  }
  private async executeStepChain(startStepId: string, ctx: StepHandlerContext) {
    let currentStepId: string | null = startStepId;
    let stepsCount = 0;

    try {
      while (currentStepId) {
        if (stepsCount >= MAX_STEPS_PER_MESSAGE) {
          this.logger.warn(`Max steps (${MAX_STEPS_PER_MESSAGE}) reached for ${ctx.user.phone}. Potential loop?`);
          break;
        }
        stepsCount++;

        const step = ctx.flowDef.steps[currentStepId];
        if (!step) {
          await ctx.stateService.clearStep(ctx.msg.instanceId, ctx.user.phone);
          break;
        }

        ctx.step = step;

        if (step.type === 'OPTIONS' || step.type === 'INPUT' || step.type === 'IDENTIFICATION') {
          const lastStep = await ctx.stateService.peekHistory(ctx.msg.instanceId, ctx.user.phone);
          if (lastStep !== currentStepId) {
            await ctx.stateService.pushHistory(
              ctx.msg.instanceId,
              ctx.user.phone,
              currentStepId,
            );
          }
        }

        await ctx.stateService.setStep(
          ctx.msg.instanceId,
          ctx.user.phone,
          currentStepId,
        );

        const handler = this.handlerFactory.getHandler(step.type);
        if (!handler) break;

        const encadeamentoAutomaticoId = await handler.executeStep(ctx);
        currentStepId = encadeamentoAutomaticoId;
      }
    } catch (error) {
      this.logger.error(
        `Erro crítico executando a cadeia de passos ${currentStepId}:`,
        error,
      );
    }
  }
}
