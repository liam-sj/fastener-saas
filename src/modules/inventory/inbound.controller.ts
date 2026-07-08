import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { InboundService } from './inbound.service';
import { CreateInboundDto } from './dto/create-inbound.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('入库单')
@ApiBearerAuth()
@Controller('api/inbound-orders')
export class InboundController {
  constructor(private readonly inboundService: InboundService) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: any) { return this.inboundService.findAll(query); }

  @ApiOperation({ summary: '查询详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.inboundService.findOne(id); }

  @ApiOperation({ summary: '创建' })
  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateInboundDto) { return this.inboundService.create(dto); }

  @ApiOperation({ summary: '确认入库' })
  @Roles('admin', 'manager')
  @Patch(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number) { return this.inboundService.confirm(id); }
}
