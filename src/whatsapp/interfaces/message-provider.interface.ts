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
  ): Promise<any>;
  onMessage(callback: (msg: IncomingMessage) => void): void;
  onConnectionStatus(
    callback: (instanceId: string, status: string, qrCode?: string) => void,
  ): void;
}
