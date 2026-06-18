import {
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrTagNotFound, ErrTagDuplicate } from '../common/constants/error-codes';

@Injectable()
export class TagService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tag.findMany({
      orderBy: { articleCount: 'desc' },
    });
  }

  async findBySlug(slug: string) {
    const tag = await this.prisma.tag.findUnique({ where: { slug } });
    if (!tag) {
      throw new BusinessException(ErrTagNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }
    return tag;
  }

  async create(dto: { name: string; description?: string; color?: string }) {
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '');

    try {
      return await this.prisma.tag.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          color: dto.color,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new BusinessException(ErrTagDuplicate, { httpStatus: HttpStatus.CONFLICT });
      }
      throw error;
    }
  }
}
