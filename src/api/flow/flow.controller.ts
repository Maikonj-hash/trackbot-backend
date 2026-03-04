import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Patch,
} from '@nestjs/common';
import { FlowService } from './flow.service';

@Controller('flows')
export class FlowController {
  constructor(private readonly flowService: FlowService) {}

  @Post()
  create(
    @Body() data: { name: string; description?: string; jsonContent?: any },
  ) {
    return this.flowService.create(data);
  }

  @Get()
  findAll() {
    return this.flowService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.flowService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() data: { name?: string; description?: string; jsonContent?: any },
  ) {
    return this.flowService.update(id, data);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.flowService.remove(id);
  }

  // Rota especializada para vincular um fluxo a uma instancia conectada
  @Patch(':id/attach/:instanceId')
  attachFlow(@Param('id') id: string, @Param('instanceId') instanceId: string) {
    return this.flowService.attachToInstance(id, instanceId);
  }
}
