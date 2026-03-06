import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { SwitchStep } from '../types';
import { VariableService } from '../variable.service';

@Injectable()
export class SwitchHandler implements IStepHandler {
    private readonly logger = new Logger(SwitchHandler.name);

    constructor(private readonly variableService: VariableService) { }

    canHandle(type: string): boolean {
        return type === 'SWITCH';
    }

    // Bloco passivo: nunca processa input direto do chat
    async processInput(ctx: StepHandlerContext): Promise<string | null> {
        return null;
    }

    async executeStep(ctx: StepHandlerContext): Promise<string | null> {
        const switchStep = ctx.step as SwitchStep;

        const evalVar = switchStep.variable;
        if (!evalVar) {
            this.logger.warn(`Switch block ${ctx.step.id} has no variable to evaluate. Routing to default.`);
            return switchStep.defaultStepId || null;
        }

        // Usar o motor de variavel para achar o valor exato no runtime
        // Ex: evalVar = "user.metadata.plano" ou "sys.time"
        const rawValue = this.variableService.resolve(`{{${evalVar}}}`, { user: ctx.user, flowDef: ctx.flowDef });

        // Fallback pra string vazia caso a variável não exista
        const isUnresolved = rawValue === `{{${evalVar}}}` || rawValue === undefined || rawValue === null;
        const stringValue = isUnresolved ? "" : String(rawValue).trim().toLowerCase();

        // Procura por alguma branch que bata com o valor
        for (const branch of switchStep.branches || []) {
            const branchVal = branch.value ? branch.value.trim().toLowerCase() : "";
            if (branchVal === stringValue) {
                return branch.targetStepId;
            }
        }

        // Se nao achou nada, vai pro default
        return switchStep.defaultStepId || null;
    }
}
