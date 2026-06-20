import { IsOptional, IsString, IsArray, IsUUID } from 'class-validator';

/**
 * 草稿保存 DTO —— 不做任何格式校验
 *
 * 草稿的目的是防止用户写一半丢失，因此标题、内容、摘要均可为空，
 * 也不限制最小 / 最大长度。前端可以在发布时再做格式校验。
 */
export class SaveDraftDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
