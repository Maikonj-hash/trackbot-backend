import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

@WebSocketGateway({ cors: true })
@Injectable()
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  emit(event: string, payload: any) {
    this.server.emit(event, payload);
    this.logger.log(`Evento WS disparado [${event}]`);
  }
}
