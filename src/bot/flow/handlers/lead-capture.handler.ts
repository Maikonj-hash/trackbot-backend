import { Injectable, Logger } from '@nestjs/common';
import { IStepHandler, StepHandlerContext } from './handler.interface';
import { LeadCaptureStep, LeadCaptureField } from '../types';

@Injectable()
export class LeadCaptureHandler implements IStepHandler {
    private readonly logger = new Logger(LeadCaptureHandler.name);

    canHandle(type: string): boolean {
        return type === 'LEAD_CAPTURE';
    }

    async processInput(ctx: StepHandlerContext): Promise<string | null> {
        const step = ctx.step as LeadCaptureStep;
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.msg.sender;
        const value = ctx.msg.content.trim();

        const rawIndex = await ctx.stateService.getMetadata(instanceId, userPhone, 'lead_field_idx');
        let currentIndex = parseInt(rawIndex || '0');

        if (isNaN(currentIndex) || currentIndex >= step.fields.length) {
            this.logger.warn(`[LEAD_CAPTURE] Invalid index ${currentIndex} for user ${userPhone}`);
            await ctx.stateService.clearMetadata(instanceId, userPhone);
            return step.nextStepId ?? null;
        }

        const currentField = step.fields[currentIndex];

        const isValid = this.validateField(currentField, value);
        if (!isValid) {
            await ctx.outgoingQueue.add('send', {
                instanceId,
                to: userPhone,
                content: `❌ Formato inválido para *${currentField.label}*. Por favor, tente novamente:`,
                delayMs: 500,
            });
            return step.id;
        }

        await this.saveFieldValue(ctx, currentField, value);

        currentIndex++;

        if (currentIndex < step.fields.length) {
            await ctx.stateService.setMetadata(instanceId, userPhone, 'lead_field_idx', currentIndex.toString());
            return step.id;
        } else {
            await ctx.stateService.clearMetadata(instanceId, userPhone);
            this.logger.log(`[LEAD_CAPTURE] User ${userPhone} finished form ${step.id}`);
            return step.nextStepId ?? null;
        }
    }

    async executeStep(ctx: StepHandlerContext): Promise<string | null> {
        const step = ctx.step as LeadCaptureStep;
        const instanceId = ctx.msg.instanceId;
        const userPhone = ctx.msg.sender;

        const rawIndex = await ctx.stateService.getMetadata(instanceId, userPhone, 'lead_field_idx');
        let currentIndex = parseInt(rawIndex || '0');

        if (step.skipIfAlreadyFilled) {
            while (currentIndex < step.fields.length) {
                const field = step.fields[currentIndex];
                const hasValue = await this.checkIfFieldHasValue(ctx, field);
                if (hasValue) {
                    currentIndex++;
                } else {
                    break;
                }
            }
            await ctx.stateService.setMetadata(instanceId, userPhone, 'lead_field_idx', currentIndex.toString());
        }

        if (currentIndex >= step.fields.length) {
            await ctx.stateService.clearMetadata(instanceId, userPhone);
            return step.nextStepId ?? null;
        }

        const currentField = step.fields[currentIndex];

        let content = '';
        if (currentIndex === 0 && step.content) {
            content = ctx.variableService.resolve(step.content, {
                user: ctx.user,
                flowDef: ctx.flowDef,
            }) + '\n\n';
        }

        content += `👉 *${currentField.label}*`;

        await ctx.outgoingQueue.add('send', {
            instanceId,
            to: userPhone,
            content,
            delayMs: 1200,
        });

        return null;
    }

    private validateField(field: LeadCaptureField, value: string): boolean {
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

    private async saveFieldValue(ctx: StepHandlerContext, field: LeadCaptureField, value: string) {
        if (field.saveToVariable === 'name') {
            await ctx.prisma.user.update({
                where: { id: ctx.user.id },
                data: { name: value },
            });
        } else {
            const varName = field.saveToVariable.toLowerCase();
            const currentMetadata = (ctx.user as any).metadata || {};
            const newMetadata = { ...currentMetadata, [varName]: value };

            await ctx.prisma.user.update({
                where: { id: ctx.user.id },
                data: { metadata: newMetadata },
            });
            (ctx.user as any).metadata = newMetadata;
        }
    }

    private async checkIfFieldHasValue(ctx: StepHandlerContext, field: LeadCaptureField): Promise<boolean> {
        if (field.saveToVariable === 'name') {
            return !!ctx.user.name && ctx.user.name !== 'User';
        }
        const metadata = (ctx.user as any).metadata || {};
        return metadata[field.saveToVariable] !== undefined && metadata[field.saveToVariable] !== '';
    }
}
