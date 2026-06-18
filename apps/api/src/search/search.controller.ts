import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrSearchQueryEmpty } from '../common/constants/error-codes';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // ─── Full-text search ──────────────────────────────
  @Get()
  search(
    @Query('q') q: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    if (!q || q.trim().length === 0) {
      throw new BusinessException(ErrSearchQueryEmpty, { httpStatus: HttpStatus.BAD_REQUEST });
    }
    return this.searchService.search(q.trim(), page, pageSize);
  }

  // ─── Suggest ──────────────────────────────────────
  @Get('suggest')
  suggest(@Query('q') q: string) {
    if (!q || q.trim().length === 0) {
      throw new BusinessException(ErrSearchQueryEmpty, { httpStatus: HttpStatus.BAD_REQUEST });
    }
    return this.searchService.suggest(q.trim());
  }
}
