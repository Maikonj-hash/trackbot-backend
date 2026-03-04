export interface IncomingMessage {
  instanceId: string;
  sender: string;
  content: string;
  fromMe: boolean;
  timestamp: Date;
  raw: any;
}

export interface IMessageProvider {
  connect(instanceId: string): Promise<void>;
  disconnect(instanceId: string): Promise<void>;
  sendMessage(
    instanceId: string,
    to: string,
    content: string,
    media?: { url: string; type: string; ptt?: boolean },
    interactive?: {
      type: 'button' | 'list';
      buttons?: Array<{ id: string; text: string }>;
      list?: {
        buttonText: string;
        title?: string;
        footer?: string;
        sections: Array<{
          title: string;
          rows: Array<{ id: string; title: string; description?: string }>;
        }>;
      };
    },
  ): Promise<any>;
  onMessage(callback: (msg: IncomingMessage) => void): void;
  onConnectionStatus(
    callback: (instanceId: string, status: string, qrCode?: string) => void,
  ): void;
}
