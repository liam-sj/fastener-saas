import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/category/create-category.dto';
import { UpdateCategoryDto } from './dto/category/update-category.dto';

@Controller('api/categories')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  findTree() { return this.categoryService.findTree(); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.categoryService.findOne(id); }

  @Post()
  create(@Body() dto: CreateCategoryDto) { return this.categoryService.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDto) { return this.categoryService.update(id, dto); }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) { return this.categoryService.remove(id); }
}
