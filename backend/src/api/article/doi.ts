import { BadRequestException } from '@nestjs/common';
export function normalizeDoi(value: string): string {
  if (typeof value !== 'string') throw new BadRequestException('Invalid DOI');
  const doi = value.trim().replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '').toLowerCase();
  if (!/^10\.\d{4,}(?:\.\d+)*\/\S+$/.test(doi) || doi.length > 500) throw new BadRequestException('Invalid DOI');
  return doi;
}
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
