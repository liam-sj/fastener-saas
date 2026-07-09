import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductionService } from './production.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProcessStepDto } from './dto/update-process-step.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('生产工单')
@ApiBearerAuth()
@Controller('api/production-orders')
export class ProductionController {
  constructor(private readonly productionService: ProductionService) {}

  @ApiOperation({ summary: '分页查询列表' })
  @Get()
  findAll(@Query() query: any) {
    return this.productionService.findAll(query);
  }

  @ApiOperation({ summary: '查询详情(含工序链)' })
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productionService.findOne(id);
  }

  @ApiOperation({ summary: '创建生产工单 + 工序链' })
  @Roles('admin', 'manager')
  @Post()
  create(@Body() dto: CreateProductionOrderDto) {
    return this.productionService.create(dto);
  }

  @ApiOperation({ summary: '启动生产(planning -> in_progress)' })
  @Roles('admin', 'manager')
  @Patch(':id/start')
  start(@Param('id', ParseIntPipe) id: number) {
    return this.productionService.start(id);
  }

  @ApiOperation({ summary: '完成工序(记录产出量,自动推进下一道)' })
  @Roles('admin', 'manager')
  @Patch(':id/steps/:stepId/complete')
  completeStep(
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateProcessStepDto,
  ) {
    return this.productionService.completeStep(id, stepId, dto);
  }

  @ApiOperation({ summary: '跳过工序' })
  @Roles('admin', 'manager')
  @Patch(':id/steps/:stepId/skip')
  skipStep(
    @Param('id', ParseIntPipe) id: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.productionService.skipStep(id, stepId);
  }

  @ApiOperation({ summary: '取消生产工单' })
  @Roles('admin', 'manager')
  @Patch(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.productionService.cancel(id);
  }
}
