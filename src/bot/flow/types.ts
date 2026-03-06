export type FlowStepType =
  | 'TEXT' // Envia texto plano
  | 'OPTIONS' // Aguarda e valida input entre N opções
  | 'INPUT' // Aguarda input livre (texto, nome, etc)
  | 'CONDITION' // "If/Else" invisível que roteia conforme variaveis do user
  | 'HTTP_REQUEST' // Bate numa API externa (webhook) e salva a resposta numa var
  | 'DELAY' // Pausa a execução por N segundos simulando que está pensando
  | 'MEDIA' // Envio de PTT (audio), Imagens ou Videos
  | 'SET_VARIABLE' // Operações matemáticas ou setagem literal em variaveis de contexto
  | 'HANDOVER' // Transfere pro atendimento humano e avisa no ws
  | 'CUSTOMER_IDENTIFICATION' // Captura múltipla de dados (Formulário)
  | 'SWITCH' // Roteador múltiplo (Switch/Case) baseado em valores específicos
  | 'END'; // Encerra forçadamente o fluxo

// Bloco Base Genérico
export interface BaseStep {
  id: string;
  type: FlowStepType;
  nextStepId?: string | null;
}

// 1. Bloco de Texto (Só dispara uma msg e vai pro próximo)
export interface TextStep extends BaseStep {
  type: 'TEXT';
  content: string;
}

// 2. Bloco de Opções (Menu 1, 2, 3...)
export interface OptionsStep extends BaseStep {
  type: 'OPTIONS';
  content: string; // Ex: "Escolha uma opção:"
  options: {
    [key: string]: string; // "Opção 1" -> "STEP_ID"
  };
  useNativeButtons?: boolean; // Se true, envia botões/lista em vez de texto
  listButtonLabel?: string;    // Texto do botão que abre a lista (ex: "Ver Opções")
  listTitle?: string;         // Título da lista/botão
  listFooter?: string;        // Rodapé da lista/botão
  fallbackStepId?: string; // Pra onde ir se ele digitar algo inválido
}

// 3. Bloco de Input Livre (Qual seu nome?)
export interface InputStep extends BaseStep {
  type: 'INPUT';
  content: string; // "Digite seu email:"
  saveToVariable: string; // "email" (vai salvar isso no banco no campo email ou metadados)
}

// 4. Bloco de Condição Lógica (If / Else)
export interface ConditionStep extends BaseStep {
  type: 'CONDITION';
  variable: string; // Ex: "user.isPremium" ou "user.name"
  operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
  value?: string | boolean; // O que testar
  trueStepId: string; // Se if(true) vai pra cá
  falseStepId: string; // Se if(false) vai pra cá
}

// 5. Bloco de Webhook (Bate na API do RD Station, Asaas, etc)
export interface HttpRequestStep extends BaseStep {
  type: 'HTTP_REQUEST';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string; // "https://api.meusistema.com/v1/cliente"
  headers?: Record<string, string>; // Headers customizáveis (ex: Authorization)
  bodyPayload?: Record<string, any>;

  // Caminhos de saída
  successStepId?: string | null; // Se 2xx
  failureStepId?: string | null; // Se erro (4xx, 5xx ou timeout)

  // Mapeamento Avançado
  saveResponseToVariable?: string; // Salva o corpo todo
  saveStatusToVariable?: string;   // Salva o status code (ex: 200, 404)
  responseMapping?: Array<{
    jsonPath: string;     // Ex: "data.user.id"
    variableName: string; // Ex: "external_id"
  }>;

  timeout?: number; // ms
}

// 6. Bloco de Atraso
export interface DelayStep extends BaseStep {
  type: 'DELAY';
  durationMs: number; // 3000 = 3 segs de delay
}

// 7. Bloco de Mídia (Imagens, Videos, Audios Gravados)
export interface MediaStep extends BaseStep {
  type: 'MEDIA';
  mediaType: 'image' | 'video' | 'audio' | 'document';
  url: string; // URL publica do S3/CDN
  caption?: string;
  ptt?: boolean; // Push To Talk (Aparece como audios gravados no whatsapp)
}

// 8. Bloco de Manipulação de Variáveis
export interface SetVariableStep extends BaseStep {
  type: 'SET_VARIABLE';
  variable: string; // Ex: score
  action: 'SET' | 'INCREMENT' | 'DECREMENT';
  value: string | number; // Ex: 1 pra incrementar
}

// 9. Bloco de Transferência Humana
export interface HandoverStep extends BaseStep {
  type: 'HANDOVER';
  department?: string; // Opcional (rotear pra Financeiro, etc)
}

// 10. Bloco de Identificação de Cliente (Formulário Multi-Campo)
export interface CustomerIdentificationField {
  label: string;
  type: 'TEXT' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'CPF';
  saveToVariable: string;
}

export interface CustomerIdentificationStep extends BaseStep {
  type: 'CUSTOMER_IDENTIFICATION';
  content: string; // "Olá! Para começarmos, preencha seus dados:"
  fields: CustomerIdentificationField[];
  submitButtonText?: string;
  skipIfAlreadyFilled?: boolean; // Se true, o Handler pula campos que já tenham valor no user.metadata
}

// 11. Bloco Roteador (Switch / Case)
export interface SwitchStep extends BaseStep {
  type: 'SWITCH';
  variable: string; // Qual variável avaliar. Ex: "user.metadata.plano"
  branches: Array<{
    value: string; // Qual valor aciona esta rota. Ex: "vip"
    targetStepId: string; // ID do bloco destino
  }>;
  defaultStepId?: string | null; // Caminho fallback caso o valor não bata com nenhuma branch (agora permite null seguro)
}

export type AnyFlowStep =
  | TextStep
  | OptionsStep
  | InputStep
  | ConditionStep
  | HttpRequestStep
  | DelayStep
  | MediaStep
  | SetVariableStep
  | HandoverStep
  | SwitchStep
  | CustomerIdentificationStep;

export interface FlowDefinition {
  id: string;
  name: string;
  firstStepId?: string | null; // ID do primeiro bloco (startBlock)
  steps: Record<string, AnyFlowStep>;
}
