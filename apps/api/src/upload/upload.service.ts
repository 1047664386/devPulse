import {
  Injectable,
  OnModuleInit,
  HttpStatus,
} from '@nestjs/common';
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

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
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

    return {
      url: `/uploads/${filename}`,
    };
  }
}
