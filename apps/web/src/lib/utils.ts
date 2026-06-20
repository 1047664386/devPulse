import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 后端 API 基础 URL
 *
 * - 开发环境：不设置 → 空字符串 → /uploads/xxx 走 Vite proxy 转发到后端
 * - 生产同源部署（Nginx 同时代理 /api 和 /uploads）：不设置 → 同上
 * - 生产分源部署（前端 CDN + 后端 API）：设置 VITE_API_URL=https://api.example.com
 *   → 兼容历史遗留的相对路径数据
 *
 * 注意：新数据由后端 UploadService 通过 APP_URL 返回完整 URL，此处仅做历史数据兜底
 */
const API_BASE = (import.meta.env.VITE_API_URL as string) || '';

/**
 * 解析上传文件 URL（兼容历史数据）
 *
 * - 后端已返回完整 URL（http/https 开头）→ 直接使用，无需处理
 * - 历史遗留相对路径（/uploads/xxx.webp）→ 拼接 VITE_API_URL 前缀
 *
 * 推荐做法：后端配置 APP_URL 环境变量，UploadService 直接返回完整 URL，
 * 前端无需关心存储细节，换 CDN/OSS 也只改后端配置。
 */
export function resolveUploadUrl(url: string | null | undefined): string {
  if (!url) return '';
  // 已经是完整 URL（http/https 开头）→ 直接返回（后端 UploadService 新数据走这个分支）
  if (/^https?:\/\//.test(url)) return url;
  // 历史遗留的相对路径（/uploads/xxx.webp）→ 拼接 API_BASE 兜底
  if (url.startsWith('/uploads/')) return `${API_BASE}${url}`;
  return url;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '刚刚';
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay < 30) return `${diffDay} 天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}
