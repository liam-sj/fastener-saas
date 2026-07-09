import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { SkuService } from './sku.service';
import { CreateSkuDto } from './dto/sku/create-sku.dto';
import { UpdateSkuDto } from './dto/sku/update-sku.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('SKU')
@ApiBearerAuth()
@Controller('api/products/:productId/skus')
export class SkuController {
  constructor(private readonly skuService: SkuService) {}

  @ApiOperation({ summary: '查询SKU列表' })
  @Get()
  findByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.skuService.findByProduct(productId);
  }

  @ApiOperation({ summary: '创建SKU' })
  @Roles('admin', 'manager')
  @Post()
  create(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateSkuDto,
  ) {
    return this.skuService.create(productId, dto);
  }

  @ApiOperation({ summary: '更新SKU' })
  @Roles('admin', 'manager')
  @Patch(':skuId')
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('skuId', ParseIntPipe) skuId: number,
    @Body() dto: UpdateSkuDto,
  ) {
    return this.skuService.update(productId, skuId, dto);
  }

  @ApiOperation({ summary: '删除SKU' })
  @Roles('admin')
  @Delete(':skuId')
  remove(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('skuId', ParseIntPipe) skuId: number,
  ) {
    return this.skuService.remove(productId, skuId);
  }
}
