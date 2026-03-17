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

        const rawValue = await this.variableService.get(ctx.user, evalVar, ctx.flowDef);
        const isUnresolved = rawValue === undefined || rawValue === null;
        const stringValue = isUnresolved ? "" : (typeof rawValue === 'object' ? JSON.stringify(rawValue) : String(rawValue)).trim().toLowerCase();
        const numValue = Number(stringValue);
        const isNumeric = !isNaN(numValue) && stringValue !== "";

        await ctx.stateService.pushJourney(ctx.msg.instanceId, ctx.userPhone, {
            type: 'INTERACTION',
            nodeId: switchStep.id,
            nodeType: switchStep.type,
            label: `Switch: ${evalVar}`,
            value: stringValue || '(vazio)',
            timestamp: new Date().toISOString(),
        });

        for (const branch of switchStep.branches || []) {
            const branchVal = branch.value ? branch.value.trim().toLowerCase() : "";
            const branchNum = Number(branchVal);
            const isBranchNumeric = !isNaN(branchNum) && branchVal !== "";

            if (isNumeric && isBranchNumeric) {
                if (numValue === branchNum) return branch.targetStepId;
            } else if (branchVal === stringValue) {
                return branch.targetStepId;
            }
        }

        return switchStep.defaultStepId || null;
    }
}
