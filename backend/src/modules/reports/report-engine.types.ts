import { z } from 'zod';

export const ReportQueryInput = z.object({
  templateId: z.string().min(1).optional(),
  dimensions: z.array(z.string()).min(1).max(3).optional(),
  measures: z.array(z.string()).min(1).max(5).optional(),
  filters: z
    .object({
      tarihBaslangic: z.string().datetime().optional(),
      tarihBitis: z.string().datetime().optional(),
      subeId: z.string().uuid().optional(),
    })
    .optional()
    .default({}),
});

export type ReportQueryInputType = z.infer<typeof ReportQueryInput>;

export const ReportExportInput = ReportQueryInput.extend({
  reportAdi: z.string().min(1).optional(),
}).refine(
  (data) => Boolean(data.templateId) || (Boolean(data.dimensions?.length) && Boolean(data.measures?.length)),
  { message: 'templateId veya boyut/ölçü listesi gerekli.' },
);

export type ReportExportInputType = z.infer<typeof ReportExportInput>;
