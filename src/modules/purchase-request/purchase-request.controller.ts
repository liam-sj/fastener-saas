import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { PurchaseRequestService } from './purchase-request.service';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { QueryPurchaseRequestDto } from './dto/query-purchase-request.dto';
import { MatchSkuDto } from './dto/match-sku.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('订购单')
@ApiBearerAuth()
@Controller('api/purchase-requests')
export class PurchaseRequestController {
  constructor(
    private readonly purchaseRequestService: PurchaseRequestService,
  ) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: QueryPurchaseRequestDto) {
    return this.purchaseRequestService.findAll(query);
  }

  @ApiOperation({ summary: '查询详情(含报价版本沿革)' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequestService.findOne(id);
  }

  @ApiOperation({ summary: '创建订购单' })
  @Roles('admin', 'manager', 'staff')
  @Post()
  create(@Body() dto: CreatePurchaseRequestDto) {
    return this.purchaseRequestService.create(dto);
  }

  @ApiOperation({ summary: '开始报价(pending → quoting)' })
  @Roles('admin', 'manager')
  @Patch(':id/start-quoting')
  startQuoting(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequestService.startQuoting(id);
  }

  @ApiOperation({ summary: '条目匹配 SKU' })
  @Roles('admin', 'manager')
  @Patch(':id/items/:itemId/match-sku')
  matchSku(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: MatchSkuDto,
  ) {
    return this.purchaseRequestService.matchSku(id, itemId, dto);
  }

  @ApiOperation({ summary: '接受订购单' })
  @Roles('admin', 'manager')
  @Patch(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequestService.accept(id);
  }

  @ApiOperation({ summary: '拒绝订购单' })
  @Roles('admin', 'manager')
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequestService.reject(id);
  }

  @ApiOperation({ summary: '取消订购单' })
  @Roles('admin', 'manager')
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequestService.cancel(id);
  }

  @ApiOperation({ summary: '删除(仅 pending)' })
  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseRequestService.remove(id);
  }
}
