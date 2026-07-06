import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { SkuService } from './sku.service';
import { CreateSkuDto } from './dto/sku/create-sku.dto';
import { UpdateSkuDto } from './dto/sku/update-sku.dto';

@Controller('api/products/:productId/skus')
export class SkuController {
  constructor(private readonly skuService: SkuService) {}

  @Get()
  findByProduct(@Param('productId', ParseIntPipe) productId: number) {
    return this.skuService.findByProduct(productId);
  }

  @Post()
  create(@Param('productId', ParseIntPipe) productId: number, @Body() dto: CreateSkuDto) {
    return this.skuService.create(productId, dto);
  }

  @Patch(':skuId')
  update(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('skuId', ParseIntPipe) skuId: number,
    @Body() dto: UpdateSkuDto,
  ) {
    return this.skuService.update(productId, skuId, dto);
  }

  @Delete(':skuId')
  remove(
    @Param('productId', ParseIntPipe) productId: number,
    @Param('skuId', ParseIntPipe) skuId: number,
  ) {
    return this.skuService.remove(productId, skuId);
  }
}
