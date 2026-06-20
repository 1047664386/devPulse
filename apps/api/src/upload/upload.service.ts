import {
  Injectable,
  OnModuleInit,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrFileEmpty, ErrFileTypeInvalid } from '../common/constants/error-codes';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly uploadDir: string;
  /** 应用对外访问的基础 URL，用于拼接上传文件的完整路径 */
  private readonly appUrl: string;

  constructor(private configService: ConfigService) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR') || './uploads';
    this.appUrl = this.configService.get<string>('APP_URL') || '';
  }

  onModuleInit() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // ─── Upload image ──────────────────────────────────
  async uploadImage(file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BusinessException(ErrFileEmpty, { httpStatus: HttpStatus.BAD_REQUEST });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BusinessException(ErrFileTypeInvalid, {
        httpStatus: HttpStatus.BAD_REQUEST,
        detail: 'Invalid file type. Only jpg, jpeg, png, webp, and gif are allowed.',
      });
    }

    // Generate unique filename
    const filename = `${Date.now()}-${randomUUID()}.webp`;
    const filePath = path.join(this.uploadDir, filename);

    // Ensure directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    // Process image: resize and convert to webp
    await sharp(file.buffer)
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filePath);

    // 返回完整 URL：APP_URL 有值时拼接为绝对路径，无值时返回相对路径（开发/同源场景）
    const relativePath = `/uploads/${filename}`;
    return {
      url: this.appUrl ? `${this.appUrl}${relativePath}` : relativePath,
    };
  }
}
