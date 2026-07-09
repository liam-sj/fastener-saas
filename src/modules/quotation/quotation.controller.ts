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
import { QuotationService } from './quotation.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('报价单')
@ApiBearerAuth()
@Controller('api/quotations')
export class QuotationController {
  constructor(private readonly quotationService: QuotationService) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: QueryQuotationDto) {
    return this.quotationService.findAll(query);
  }

  @ApiOperation({ summary: '查询详情' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.findOne(id);
  }

  @ApiOperation({ summary: '创建' })
  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateQuotationDto) {
    return this.quotationService.create(dto);
  }

  @ApiOperation({ summary: '更新' })
  @Roles('admin', 'manager')
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQuotationDto,
  ) {
    return this.quotationService.update(id, dto);
  }

  @ApiOperation({ summary: '发送报价' })
  @Roles('admin', 'manager')
  @Patch(':id/send')
  send(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.send(id);
  }

  @ApiOperation({ summary: '接受报价并生成订单' })
  @Roles('admin', 'manager')
  @Patch(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.accept(id);
  }

  @ApiOperation({ summary: '拒绝报价' })
  @Roles('admin', 'manager')
  @Patch(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.reject(id);
  }

  @ApiOperation({ summary: '基于被拒绝的报价创建新版本' })
  @Roles('admin', 'manager')
  @Post(':id/new-version')
  createNewVersion(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.createNewVersion(id);
  }

  @ApiOperation({ summary: '删除' })
  @Roles('admin')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.quotationService.remove(id);
  }
}
