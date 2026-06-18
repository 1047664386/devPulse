import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ArticleService } from './article.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleListQueryDto } from './dto/article-list-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../common/guards/optional-auth.guard';
import { PermissionsGuard } from '../common/permission/permissions.guard';
import { RequirePermission } from '../common/permission/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Articles')
@Controller('articles')
export class ArticleController {
  constructor(private readonly articleService: ArticleService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'List published articles with pagination' })
  findAll(
    @Query() query: ArticleListQueryDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.articleService.findAll(query, userId);
  }

  @Get('id/:id')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get article by ID (for editor)' })
  findById(
    @Param('id') id: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.articleService.findById(id, userId);
  }

  @Get(':slug')
  @UseGuards(OptionalAuthGuard)
  @ApiOperation({ summary: 'Get article by slug' })
  findBySlug(
    @Param('slug') slug: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.articleService.findBySlug(slug, userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('article:create')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new article' })
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.articleService.create(dto, userId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('article:update:any')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an article (optimistic lock)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.articleService.update(id, dto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('article:delete:any')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft delete an article' })
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.articleService.remove(id, userId);
  }

  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle like on an article' })
  @HttpCode(HttpStatus.OK)
  toggleLike(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.articleService.toggleLike(id, userId);
  }

  @Post(':id/bookmark')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle bookmark on an article' })
  @HttpCode(HttpStatus.OK)
  toggleBookmark(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.articleService.toggleBookmark(id, userId);
  }
}
