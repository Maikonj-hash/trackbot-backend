import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { CustomerIdentificationStep, CustomerIdentificationField } from '../types';

@Injectable()
export class CustomerIdentificationHandler implements IStepHandler {
    private readonly logger = new Logger(CustomerIdentificationHandler.name);

    canHandle(type: string): boolean {
        return type === 'CUSTOMER_IDENTIFICATION';
    }

    async processInput(ctx: StepHandlerContext): Promise<string | null> {
        const step = ctx.step as CustomerIdentificationStep;
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.userPhone;
        const value = ctx.msg.content.trim();

        const rawIndex = await ctx.stateService.getMetadata(instanceId, userPhone, 'identification_field_idx');
        let currentIndex = parseInt(rawIndex || '0');

        if (isNaN(currentIndex) || currentIndex >= step.fields.length) {
            this.logger.warn(`[IDENTIFICATION] Invalid index ${currentIndex} for user ${userPhone}`);
            await ctx.stateService.clearMetadata(instanceId, userPhone);
            return step.nextStepId ?? null;
        }

        const currentField = step.fields[currentIndex];

        const isValid = this.validateField(currentField, value);
        if (!isValid) {
            await ctx.outgoingQueue.add('send', {
                instanceId,
                to: ctx.msg.sender,
                content: `❌ Formato inválido para *${currentField.label}*. Por favor, tente novamente:`,
                delayMs: 500,
            });
            return step.id;
        }

        await this.saveFieldValue(ctx, currentField, value);

        await ctx.stateService.pushJourney(ctx.msg.instanceId, ctx.userPhone, {
            type: 'INTERACTION',
            nodeId: step.id,
            nodeType: step.type,
            label: currentField.label,
            value: value,
            timestamp: new Date().toISOString(),
        });

        const isEditOne = await ctx.stateService.getMetadata(instanceId, userPhone, 'edit_one_mode');
        if (isEditOne === 'true') {
            await ctx.stateService.deleteMetadata(instanceId, userPhone, 'edit_one_mode');
            await ctx.stateService.deleteMetadata(instanceId, userPhone, 'identification_field_idx');
            await ctx.stateService.setMetadata(instanceId, userPhone, 'force_review_once', 'true');
            this.logger.log(`[IDENTIFICATION] Edit One mode finished for ${userPhone}. Forcing review next.`);
            return step.nextStepId ?? null;
        }

        currentIndex++;

        if (currentIndex < step.fields.length) {
            await ctx.stateService.setMetadata(instanceId, userPhone, 'identification_field_idx', currentIndex.toString());
            return step.id;
        } else {
            await ctx.stateService.deleteMetadata(instanceId, userPhone, 'identification_field_idx');
            await ctx.stateService.setMetadata(instanceId, userPhone, 'force_review_once', 'true');
            this.logger.log(`[IDENTIFICATION] User ${userPhone} finished identification ${step.id}. Forcing review next.`);
            return step.nextStepId ?? null;
        }
    }

    async executeStep(ctx: StepHandlerContext): Promise<string | null> {
        const step = ctx.step as CustomerIdentificationStep;
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.userPhone;

        const rawIndex = await ctx.stateService.getMetadata(instanceId, userPhone, 'identification_field_idx');
        if (step.skipIfAlreadyFilled) {
            const forceReview = await ctx.stateService.getMetadata(instanceId, userPhone, 'force_review_once');
            if (forceReview !== 'true') {
                const fields = step.fields || [];
                let allFilled = true;
                for (const field of fields) {
                    const value = await ctx.variableService.get(ctx.user, field.saveToVariable, ctx.flowDef);
                    if (value === undefined || value === null || value === '') {
                        allFilled = false;
                        break;
                    }
                }

                if (allFilled) {
                    this.logger.log(`[IDENTIFICATION] Skipping step ${step.id} (Smart Skip)`);
                    return step.nextStepId ?? null;
                }
            }
        }

        let currentIndex = parseInt(rawIndex || '0');

        if (currentIndex >= step.fields.length) {
            await ctx.stateService.clearMetadata(instanceId, userPhone);
            return step.nextStepId ?? null;
        }

        const currentField = step.fields[currentIndex];

        let content = '';
        if (currentIndex === 0 && step.content) {
            content = await ctx.variableService.resolve(step.content, {
                user: ctx.user,
                flowDef: ctx.flowDef,
            }) + '\n\n';
        }

        content += `*${currentField.label}*`;

        const hasHistory = await ctx.stateService.peekHistory(instanceId, userPhone);
        if (hasHistory && step.allowBack) {
            content += '\n\n_Digite *0* para voltar_';
        }

        await ctx.outgoingQueue.add('send', {
            instanceId,
            to: ctx.msg.sender,
            content,
            delayMs: 1200,
        });

        return null;
    }

    private validateField(field: CustomerIdentificationField, value: string): boolean {
        if (!value) return false;

        switch (field.type) {
            case 'EMAIL':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
            case 'CPF':
                return this.isValidCpf(value);
            case 'PHONE':
                const cleanPhone = value.replace(/\D/g, '');
                return cleanPhone.length >= 10;
            case 'NUMBER':
                return !isNaN(Number(value));
            default:
                return true;
        }
    }

    private isValidCpf(cpf: string): boolean {
        const cleanCpf = cpf.replace(/\D/g, '');

        if (cleanCpf.length !== 11) return false;

        if (/^(\d)\1+$/.test(cleanCpf)) return false;

        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cleanCpf.charAt(i)) * (10 - i);
        }
        let rev = 11 - (sum % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cleanCpf.charAt(9))) return false;

        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cleanCpf.charAt(i)) * (11 - i);
        }
        rev = 11 - (sum % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cleanCpf.charAt(10))) return false;

        return true;
    }

    private async saveFieldValue(ctx: StepHandlerContext, field: CustomerIdentificationField, value: string) {
        const userId = ctx.user.id;
        const updateData: any = {};
        const currentMetadata = (ctx.user as any).metadata || {};
        const varName = field.saveToVariable.toLowerCase();

        if (varName === 'wpp_name' || varName === 'name') {
            updateData.name = value;
            ctx.user.name = value;
            this.logger.log(`[IDENTIFICATION] Promoting identity: name=${value}`);
        } else if (varName === 'wpp_phone' || varName === 'phone') {
            const cleanPhone = value.replace(/\D/g, '');
            updateData.metadata = { ...currentMetadata, whatsapp_real: cleanPhone };
            (ctx.user as any).metadata = updateData.metadata;
            this.logger.log(`[IDENTIFICATION] Promoting identity: phone=${cleanPhone}`);
        } else {
            updateData.metadata = { ...currentMetadata, [varName]: value };
            (ctx.user as any).metadata = updateData.metadata;
            this.logger.log(`[IDENTIFICATION] Saving custom variable: ${varName}=${value}`);
        }

        if (Object.keys(updateData).length > 0) {
            await ctx.prisma.user.update({
                where: { id: userId },
                data: updateData,
            });
        }
    }

    private async checkIfFieldHasValue(ctx: StepHandlerContext, field: CustomerIdentificationField): Promise<boolean> {
        const value = await ctx.variableService.get(ctx.user, field.saveToVariable, ctx.flowDef);
        return value !== undefined && value !== null && value !== '';
    }
}
