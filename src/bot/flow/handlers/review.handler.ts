import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { ReviewStep } from '../types';

@Injectable()
export class ReviewHandler implements IStepHandler {
    private readonly logger = new Logger(ReviewHandler.name);

    canHandle(type: string): boolean {
        return type === 'REVIEW';
    }

    async executeStep(ctx: StepHandlerContext): Promise<string | null> {
        const step = ctx.step as ReviewStep;
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.userPhone;

        // Limpa subestado de edição se entrar no step normalmente
        await ctx.stateService.deleteMetadata(instanceId, userPhone, 'review_mode');

        // Lógica de Salto Inteligente (Padronizada)
        if (step.skipIfAlreadyFilled) {
            const fields = step.fields || [];
            let allFilled = true;
            for (const field of fields) {
                const varName = field.variableName?.toLowerCase();
                const value = ctx.variableService.get(ctx.user, varName);
                if (!value || value === '_Não informado_') {
                    allFilled = false;
                    break;
                }
            }

            if (allFilled) {
                this.logger.log(`[REVIEW] Skipping step ${step.id} for user ${userPhone} because all fields are filled.`);
                return step.nextStepId ?? null;
            }
        }

        let summary = ctx.variableService.resolve(step.content || "📋 *Confirme seus dados:*", {
            user: ctx.user,
            flowDef: ctx.flowDef,
        }) + '\n\n';

        const fields = step.fields || [];
        for (const field of fields) {
            // Normaliza para lowercase para bater com o que é salvo no IdentificationHandler
            const varName = field.variableName?.toLowerCase();
            const value = ctx.variableService.get(ctx.user, varName) || '_Não informado_';
            summary += `*${field.label}:* ${value}\n`;
        }

        summary += `\n1. ✅ ${step.confirmButtonText || 'Confirmar e Continuar'}`;
        summary += `\n2. ❌ ${step.editButtonText || 'Corrigir Informação'}`;

        await ctx.outgoingQueue.add('send', {
            instanceId,
            to: ctx.msg.sender,
            content: summary,
            delayMs: 1000,
        });

        return null;
    }

    async processInput(ctx: StepHandlerContext): Promise<string | null> {
        const step = ctx.step as ReviewStep;
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.userPhone;
        const input = ctx.msg.content.trim();

        const mode = await ctx.stateService.getMetadata(instanceId, userPhone, 'review_mode');

        if (mode === 'SELECT_FIELD') {
            return this.handleFieldSelection(ctx, step, input);
        }

        if (input === '1') {
            await ctx.stateService.deleteMetadata(instanceId, userPhone, 'review_mode');
            return step.nextStepId ?? null;
        }

        if (input === '2') {
            await ctx.stateService.setMetadata(instanceId, userPhone, 'review_mode', 'SELECT_FIELD');

            let fieldList = "❓ *Qual informação deseja corrigir?*\n\n";
            step.fields.forEach((f, i) => {
                fieldList += `${i + 1}. ${f.label}\n`;
            });
            fieldList += `\n0. ↩️ Voltar`;

            await ctx.outgoingQueue.add('send', {
                instanceId,
                to: ctx.msg.sender,
                content: fieldList,
                delayMs: 500,
            });
            return null;
        }

        // Se não for 1 ou 2, repete o executeStep (opcional) ou avisa erro
        return step.id;
    }

    private async handleFieldSelection(ctx: StepHandlerContext, step: ReviewStep, input: string): Promise<string | null> {
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.userPhone;

        if (input === '0') {
            await ctx.stateService.deleteMetadata(instanceId, userPhone, 'review_mode');
            // Re-executa o step principal
            await this.executeStep(ctx);
            return null;
        }

        const index = parseInt(input) - 1;
        if (isNaN(index) || index < 0 || index >= step.fields.length) {
            await ctx.outgoingQueue.add('send', {
                instanceId,
                to: ctx.msg.sender,
                content: "❌ Opção inválida. Escolha um número da lista ou 0 para voltar.",
                delayMs: 300,
            });
            return null;
        }

        const selectedField = step.fields[index];
        const varName = selectedField.variableName.toLowerCase();

        await this.clearVariable(ctx, varName);

        if (step.correctionStepId) {
            const targetStep = ctx.flowDef.steps[step.correctionStepId];
            if (targetStep?.type === 'CUSTOMER_IDENTIFICATION') {
                const targetFields = (targetStep as any).fields || [];
                const fieldIndex = targetFields.findIndex((f: any) => f.saveToVariable.toLowerCase() === varName);

                if (fieldIndex !== -1) {
                    this.logger.log(`[REVIEW] Sniper mode: Redirecionando para campo ${fieldIndex} no bloco ${step.correctionStepId}`);
                    await ctx.stateService.setMetadata(instanceId, userPhone, 'identification_field_idx', fieldIndex.toString());
                    await ctx.stateService.setMetadata(instanceId, userPhone, 'edit_one_mode', 'true');
                } else {
                    this.logger.warn(`[REVIEW] Sniper mode: Campo ${varName} não encontrado no bloco ${step.correctionStepId}. Iniciando do início.`);
                }
            }
        }

        await ctx.outgoingQueue.add('send', {
            instanceId,
            to: ctx.msg.sender,
            content: `🔄 Entendido. Vamos corrigir seu *${selectedField.label}*.`,
            delayMs: 500,
        });

        await ctx.stateService.deleteMetadata(instanceId, userPhone, 'review_mode');

        return step.correctionStepId ?? step.id;
    }

    private async clearVariable(ctx: StepHandlerContext, varName: string) {
        if (varName === 'name') {
            await ctx.prisma.user.update({
                where: { id: ctx.user.id },
                data: { name: '' },
            });
            ctx.user.name = '';
        } else {
            const currentMetadata = (ctx.user as any).metadata || {};
            const cleanVar = varName.toLowerCase();
            delete currentMetadata[cleanVar];

            await ctx.prisma.user.update({
                where: { id: ctx.user.id },
                data: { metadata: currentMetadata },
            });
            (ctx.user as any).metadata = currentMetadata;
        }
    }
}
