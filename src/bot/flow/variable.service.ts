import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { User } from '@prisma/client';
import { FlowDefinition } from './types';
import { StateService } from '../state/state.service';

@Injectable()
export class VariableService {
    private readonly logger = new Logger(VariableService.name);

    constructor(
        @Inject(forwardRef(() => StateService))
        private readonly stateService: StateService,
    ) { }

    /**
     * Resolve placeholders no formato {{key}} dentro de um texto.
     * Suporta:
     * - {{user.field}} ex: {{user.name}}, {{user.phone}}
     * - {{metadata.field}} ex: {{metadata.email}}, {{metadata.orderId}}
     * - {{flow.field}} ex: {{flow.name}}
     */
    async resolve(text: string, context: { user: User; flowDef?: FlowDefinition }): Promise<string> {
        if (!text || !text.includes('{{')) return text;

        const matches = Array.from(text.matchAll(/\{\{(.+?)\}\}/g));
        let resolvedText = text;
        const cache = new Map<string, string>();

        for (const match of matches) {
            const path = match[1].trim();
            
            if (!cache.has(path)) {
                const value = await this.getValueByPath(path, context);
                cache.set(path, value !== undefined && value !== null ? String(value) : match[0]);
            }
            
            resolvedText = resolvedText.replace(match[0], cache.get(path)!);
        }

        return resolvedText;
    }

    async get(user: User, path: string, flowDef?: FlowDefinition): Promise<any> {
        return this.getValueByPath(path, { user, flowDef });
    }

    private async getValueByPath(path: string, context: { user: User; flowDef?: FlowDefinition }): Promise<any> {
        const parts = path.split('.');
        const scope = parts[0];
        const field = parts.slice(1).join('.');

        try {
            if (scope === 'sys') return await this.resolveSystemVariable(field, context);
            if (scope === 'contact') return this.resolveContactVariable(field, context.user);
            if (scope === 'user') {
                if (field.startsWith('metadata.')) {
                    const metaField = field.replace('metadata.', '');
                    const metadata = (context.user as any).metadata || {};
                    return this.getDeepValue(metadata, metaField);
                }
                return (context.user as any)[field];
            }

            if (scope === 'metadata' || parts.length === 1) {
                const rawPath = scope === 'metadata' ? field : path;
                const metaPath = rawPath.toLowerCase(); // Normalização para case-insensitive
                const metadata = (context.user as any).metadata || {};
                return this.getDeepValue(metadata, metaPath);
            }

            if (scope === 'flow' && context.flowDef) {
                return (context.flowDef as any)[field];
            }

            return undefined;
        } catch (e) {
            this.logger.warn(`Error resolving variable path: ${path}`, e);
            return undefined;
        }
    }

    private async resolveSystemVariable(field: string, context: { user: User; flowDef?: FlowDefinition }): Promise<any> {
        const now = new Date();
        switch (field) {
            case 'date':
                return now.toLocaleDateString('pt-BR');
            case 'time':
                return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            case 'datetime':
                return now.toLocaleString('pt-BR');
            case 'greeting':
                const hour = now.getHours();
                if (hour >= 5 && hour < 12) return 'Bom dia';
                if (hour >= 12 && hour < 18) return 'Boa tarde';
                return 'Boa noite';
            case 'day_name':
                const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
                return weekday.charAt(0).toUpperCase() + weekday.slice(1);
            case 'month_name':
                const month = now.toLocaleDateString('pt-BR', { month: 'long' });
                return month.charAt(0).toUpperCase() + month.slice(1);
            case 'year':
                return now.getFullYear().toString();
            case 'protocol':
                // Gera número de protocolo único: YYYYMMDD-HHMMSS-XXXX
                const pad = (n: number) => n.toString().padStart(2, '0');
                const pDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
                const pTime = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                const random = Math.floor(1000 + Math.random() * 9000);
                return `${pDate}-${pTime}-${random}`;
            case 'payload':
                // Serializa todo o contexto do ticket para JSON, incluindo a jornada
                const journey = await this.stateService.getJourney(
                    context.user.instanceId || 'unknown', 
                    context.user.phone
                );
                const payload = {
                    ticket: {
                        protocol: await this.resolveSystemVariable('protocol', context),
                        timestamp: now.toISOString(),
                        flowId: context.flowDef?.id || 'unknown',
                        flowName: context.flowDef?.name || 'unknown',
                    },
                    customer: {
                        id: context.user.id,
                        name: context.user.name,
                        phone: context.user.phone,
                        metadata: (context.user as any).metadata || {}
                    },
                    journey: journey // Nova chave com o histórico detalhado
                };
                return JSON.stringify(payload);
            default:
                return undefined;
        }
    }

    private resolveContactVariable(field: string, user: User): any {
        if (field === 'phone') {
            if (user.phone && user.phone.includes('@lid')) {
                return 'Número Oculto (Privacidade Meta)';
            }
            return user.phone;
        }
        if (field === 'name') return user.name || '';
        return undefined;
    }

    public getDeepValue(obj: any, path: string): any {
        if (!obj || typeof obj !== 'object') return undefined;
        return path.split('.').reduce((prev, curr) => {
            return prev && prev[curr] !== undefined ? prev[curr] : undefined;
        }, obj);
    }
}
