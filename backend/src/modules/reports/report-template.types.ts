import { z } from 'zod';
import { Role } from '@prisma/client';

export const ReportAccessInput = z.object({
  userIds: z.array(z.string().uuid()).optional().default([]),
  roles: z.array(z.nativeEnum(Role)).optional().default([]),
});

export const CreateReportTemplateInput = z.object({
  ad: z.string().min(2),
  aciklama: z.string().optional(),
  boyutlar: z.array(z.string()).min(1).max(3),
  olculer: z.array(z.string()).min(1).max(5),
  filtreler: z
    .object({
      tarihBaslangic: z.string().datetime().optional(),
      tarihBitis: z.string().datetime().optional(),
      subeId: z.string().uuid().optional(),
    })
    .optional(),
  erisimler: ReportAccessInput.optional().default({ userIds: [], roles: [] }),
});

export const CreateReportScheduleInput = z.object({
  reportTemplateId: z.string().min(1),
  siklik: z.enum(['GUNLUK', 'HAFTALIK', 'AYLIK']),
  saat: z.string().regex(/^\d{2}:\d{2}$/),
  gun: z.number().int().optional(),
});

export const CreateReportRequestInput = z.object({
  istekMetni: z.string().min(5),
});

export const RunTemplateInput = z.object({
  templateId: z.string().min(1).optional(),
});

export type CreateReportTemplateInputType = z.infer<typeof CreateReportTemplateInput>;
