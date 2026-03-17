export type FlowStepType =
  | 'TEXT'
  | 'OPTIONS'
  | 'INPUT'
  | 'CONDITION'
  | 'HTTP_REQUEST'
  | 'DELAY'
  | 'MEDIA'
  | 'SET_VARIABLE'
  | 'HANDOVER'
  | 'CUSTOMER_IDENTIFICATION'
  | 'SWITCH'
  | 'REVIEW'
  | 'JUMP'
  | 'TRACK_DESK'
  | 'END';

export interface BaseStep {
  id: string;
  type: FlowStepType;
  nextStepId?: string | null;
  allowBack?: boolean;
  label?: string;
}

export interface TextStep extends BaseStep {
  type: 'TEXT';
  content: string;
}

export interface OptionsStep extends BaseStep {
  type: 'OPTIONS';
  content: string;
  options: {
    [key: string]: string;
  };
  useNativeButtons?: boolean;
  listButtonLabel?: string;
  listTitle?: string;
  listFooter?: string;
  fallbackStepId?: string;
  dynamicOptionsVariable?: string;
}

export interface InputStep extends BaseStep {
  type: 'INPUT';
  content: string;
  saveToVariable: string;
  expectedType?: 'TEXT' | 'CEP' | 'LICENSE_PLATE' | 'DATE' | 'TIME' | 'EMAIL' | 'PHONE' | 'CPF_CNPJ' | 'NUMBER';
  errorMessage?: string;
  maxRetries?: number;
}

export interface ConditionStep extends BaseStep {
  type: 'CONDITION';
  variable: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'CONTAINS' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
  value?: string | boolean;
  trueStepId: string;
  falseStepId: string;
}

export interface HttpRequestStep extends BaseStep {
  type: 'HTTP_REQUEST' | 'TRACK_DESK';
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  bodyPayload?: Record<string, any>;

  successStepId?: string | null;
  failureStepId?: string | null;
  saveResponseToVariable?: string;
  saveStatusToVariable?: string;
  responseMapping?: Array<{
    jsonPath: string;
    variableName: string;
  }>;

  timeout?: number;
}

export interface TrackDeskStep extends HttpRequestStep {
  type: 'TRACK_DESK';
}

export interface DelayStep extends BaseStep {
  type: 'DELAY';
  durationMs: number;
}

export interface MediaStep extends BaseStep {
  type: 'MEDIA';
  mediaType: 'image' | 'video' | 'audio' | 'document';
  url: string;
  caption?: string;
  ptt?: boolean;
}

export interface SetVariableStep extends BaseStep {
  type: 'SET_VARIABLE';
  variable: string;
  action: 'SET' | 'INCREMENT' | 'DECREMENT';
  value: string | number;
}

export interface HandoverStep extends BaseStep {
  type: 'HANDOVER';
  department?: string;
}

export interface CustomerIdentificationField {
  label: string;
  type: 'TEXT' | 'EMAIL' | 'PHONE' | 'NUMBER' | 'CPF';
  saveToVariable: string;
}

export interface CustomerIdentificationStep extends BaseStep {
  type: 'CUSTOMER_IDENTIFICATION';
  content: string;
  fields: CustomerIdentificationField[];
  submitButtonText?: string;
  skipIfAlreadyFilled?: boolean;
}

export interface SwitchStep extends BaseStep {
  type: 'SWITCH';
  variable: string;
  branches: Array<{
    value: string;
    targetStepId: string;
  }>;
  defaultStepId?: string | null;
}

export interface ReviewField {
  label: string;
  variableName: string;
}

export interface ReviewStep extends BaseStep {
  type: 'REVIEW';
  content: string;
  fields: ReviewField[];
  confirmButtonText?: string;
  editButtonText?: string;
  correctionStepId?: string;
  skipIfAlreadyFilled?: boolean;
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
  | CustomerIdentificationStep
  | ReviewStep
  | JumpStep
  | EndStep;

export interface JumpStep extends BaseStep {
  type: 'JUMP';
  targetStepId: string;
}

export interface EndStep extends BaseStep {
  type: 'END';
  resetType?: 'IMMEDIATE' | 'TIMEOUT';
  timeoutValue?: number;
}

export interface FlowDefinition {
  id: string;
  name: string;
  firstStepId?: string | null;
  steps: Record<string, AnyFlowStep>;
}
