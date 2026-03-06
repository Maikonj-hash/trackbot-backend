import { Injectable, Logger } from '@nestjs/common';
import { User } from '@prisma/client';
import { FlowDefinition } from './types';

@Injectable()
export class VariableService {
    private readonly logger = new Logger(VariableService.name);

    /**
     * Resolve placeholders no formato {{key}} dentro de um texto.
     * Suporta:
     * - {{user.field}} ex: {{user.name}}, {{user.phone}}
     * - {{metadata.field}} ex: {{metadata.email}}, {{metadata.orderId}}
     * - {{flow.field}} ex: {{flow.name}}
     */
    resolve(text: string, context: { user: User; flowDef?: FlowDefinition }): string {
        if (!text || !text.includes('{{')) return text;

        return text.replace(/\{\{(.+?)\}\}/g, (match, path) => {
            const value = this.getValueByPath(path.trim(), context);
            return value !== undefined && value !== null ? String(value) : match;
        });
    }

    private getValueByPath(path: string, context: { user: User; flowDef?: FlowDefinition }): any {
        const parts = path.split('.');
        const scope = parts[0];
        const field = parts.slice(1).join('.');

        try {
            // Wave 6 - Delegação estrutural para as Subfunções
            if (scope === 'sys') return this.resolveSystemVariable(field);
            if (scope === 'contact') return this.resolveContactVariable(field, context.user);

            // Legacy e Custom variables
            if (scope === 'user') {
                if (field.startsWith('metadata.')) {
                    const metaField = field.replace('metadata.', '');
                    const metadata = (context.user as any).metadata || {};
                    return this.getDeepValue(metadata, metaField);
                }
                return (context.user as any)[field];
            }

            if (scope === 'metadata' || parts.length === 1) {
                const metaPath = scope === 'metadata' ? field : path;
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

    // Refatoração Wave 6: Clean Code Architecture
    private resolveSystemVariable(field: string): any {
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
            default:
                return undefined;
        }
    }

    // Refatoração Wave 6: Clean Code Architecture
    private resolveContactVariable(field: string, user: User): any {
        if (field === 'phone') return user.phone;
        if (field === 'name') return user.name || '';
        return undefined;
    }

    private getDeepValue(obj: any, path: string): any {
        if (!obj || typeof obj !== 'object') return undefined;
        return path.split('.').reduce((prev, curr) => {
            return prev && prev[curr] !== undefined ? prev[curr] : undefined;
        }, obj);
    }
}
