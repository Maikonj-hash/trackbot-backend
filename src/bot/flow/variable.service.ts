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
                let resolvedValue: any;

                if (value === undefined || value === null) {
                    resolvedValue = ''; 
                } else if (typeof value === 'object') {
                    resolvedValue = JSON.stringify(value);
                } else {
                    resolvedValue = String(value);
                }
                
                cache.set(path, String(resolvedValue));
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
        if (parts.length === 0) return undefined;

        try {
            const scope = parts[0].toLowerCase();
            const field = parts.slice(1).join('.');

            if (scope === 'sys') return await this.resolveSystemVariable(field, context);

            if (scope === 'contact' || scope === 'user' || parts.length === 1) {
                const searchKey = parts.length === 1 ? scope : field.replace('metadata.', '');
                const result = this.resolveContactVariable(searchKey, context.user);

                if (result !== undefined) {
                    this.logger.debug(`[VARIABLE] Hit: ${path} -> ${result}`);
                    return result;
                }
            }

            if (scope === 'metadata' || parts.length === 1) {
                const metaKey = (scope === 'metadata' ? field : scope).toLowerCase();
                const metadata = (context.user as any).metadata || {};
                const value = this.getDeepValue(metadata, metaKey);
                if (value !== undefined) return value;
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
            case 'date': return now.toLocaleDateString('pt-BR');
            case 'time': return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            case 'datetime': return now.toLocaleString('pt-BR');
            case 'greeting':
                const hour = now.getHours();
                if (hour >= 5 && hour < 12) return 'Bom dia';
                if (hour >= 12 && hour < 18) return 'Boa tarde';
                return 'Boa noite';
            case 'day_name':
                const weekday = now.toLocaleDateString('pt-BR', { weekday: 'long' });
                return weekday.charAt(0).toUpperCase() + weekday.slice(1);
            case 'year': return now.getFullYear().toString();
            case 'desk_url': return process.env.TRACKDESK_API_URL || 'http://localhost:3001/api/webhook/whatsapp/chamado';
            case 'protocol':
                const pad = (n: number) => n.toString().padStart(2, '0');
                const pDate = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
                const pTime = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
                const random = Math.floor(1000 + Math.random() * 9000);
                return `${pDate}-${pTime}-${random}`;
            case 'payload':
                const journey = await this.stateService.getJourney(context.user.instanceId || 'unknown', context.user.phone);
                return JSON.stringify({
                    ticket: { protocol: await this.resolveSystemVariable('protocol', context), timestamp: now.toISOString() },
                    customer: { id: context.user.id, name: context.user.name, phone: context.user.phone, metadata: (context.user as any).metadata || {} },
                    journey
                });
            default: return undefined;
        }
    }

    /**
     * Resolve dados de contato com aliases e fallbacks inteligentes.
     * Retorna undefined para valores de "sistema" ou vazios para não poluir o Review/Skip.
     */
    private resolveContactVariable(field: string, user: User): any {
        const metadata = (user as any).metadata || {};
        const key = field.toLowerCase();

        // Lógica de Nome
        if (key === 'name' || key === 'wpp_name' || key === 'nome') {
            const name = user.name || metadata.name || metadata.wpp_name || metadata.nome;
            if (name && !['UNIDENTIFIED_USER', 'User', 'Cliente'].includes(name)) return name;
            return undefined;
        }

        // Lógica de Telefone
        if (key === 'phone' || key === 'wpp_phone' || key === 'whatsapp' || key === 'whatsapp_real') {
            const phone = metadata.whatsapp_real || metadata.phone || metadata.wpp_phone || metadata.whatsapp;
            if (phone) return phone;

            // Fallback para telefone real (se não for @lid)
            if (user.phone && !user.phone.includes('@lid')) return user.phone.split('@')[0];
            return undefined;
        }

        // E-mail
        if (key === 'email' || key === 'e-mail') {
            return metadata.email || metadata['e-mail'];
        }

        return undefined;
    }

    public getDeepValue(obj: any, path: string): any {
        if (!obj || typeof obj !== 'object') return undefined;
        return path.split('.').reduce((prev, curr) => {
            return prev && prev[curr] !== undefined ? prev[curr] : undefined;
        }, obj);
    }
}
