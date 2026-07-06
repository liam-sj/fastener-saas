import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { InboundService } from './inbound.service';
import { CreateInboundDto } from './dto/create-inbound.dto';

@Controller('api/inbound-orders')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @Get()
  findAll(@Query() query: any) { return this.inboundService.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.inboundService.findOne(id); }

  @Post()
  create(@Body() dto: CreateInboundDto) { return this.inboundService.create(dto); }

  @Patch(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) { return this.inboundService.confirm(id); }
}
