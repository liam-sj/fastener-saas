import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';

@Controller('api/quotations')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @Get()
  findAll(@Query() query: QueryQuotationDto) { return this.quotationService.findAll(query); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.quotationService.findOne(id); }

  @Post()
  create(@Body() dto: CreateQuotationDto) { return this.quotationService.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateQuotationDto) { return this.quotationService.update(id, dto); }

  @Patch(':id/send')
  send(@Param('id', ParseIntPipe) id: number) { return this.quotationService.send(id); }

  @Patch(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number) { return this.quotationService.accept(id); }

  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) { return this.quotationService.reject(id); }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.quotationService.remove(id); }
}
