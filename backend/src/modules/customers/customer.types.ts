import { z } from 'zod';

export const CustomerSearchInput = z.object({
  q: z.string().min(3),
});

export type CustomerSearchInputType = z.infer<typeof CustomerSearchInput>;

export const CreateCustomerInput = z.object({
  name: z.string().min(2),
  phone: z.string().min(1),
  note: z.string().optional(),
  identityNo: z.string().optional(),
  birthDate: z.string().datetime().optional(),
  ePostaEmail: z.string().email().optional(),
  prescriptionDate: z.string().datetime().optional(),
  hasPresciption: z.boolean().optional().default(false),
  // Daimi
  far_r_pd: z.string().optional(),
  far_r_sph: z.string().optional(),
  far_r_cyl: z.string().optional(),
  far_r_aks: z.string().optional(),
  far_r_diagnosis: z.string().optional(),
  far_l_pd: z.string().optional(),
  far_l_sph: z.string().optional(),
  far_l_cyl: z.string().optional(),
  far_l_aks: z.string().optional(),
  far_l_diagnosis: z.string().optional(),
  // Yakın
  near_r_pd: z.string().optional(),
  near_r_sph: z.string().optional(),
  near_r_cyl: z.string().optional(),
  near_r_aks: z.string().optional(),
  near_r_diagnosis: z.string().optional(),
  near_l_pd: z.string().optional(),
  near_l_sph: z.string().optional(),
  near_l_cyl: z.string().optional(),
  near_l_aks: z.string().optional(),
  near_l_diagnosis: z.string().optional(),
  // Lens
  lens_r_bc: z.string().optional(),
  lens_r_sph: z.string().optional(),
  lens_r_cyl: z.string().optional(),
  lens_r_aks: z.string().optional(),
  lens_r_add: z.string().optional(),
  lens_l_bc: z.string().optional(),
  lens_l_sph: z.string().optional(),
  lens_l_cyl: z.string().optional(),
  lens_l_aks: z.string().optional(),
  lens_l_add: z.string().optional(),
  // E-Reçete
  eRx_no: z.string().optional(),
  eRx_date: z.string().optional(),
  eRx_hospital: z.string().optional(),
  eRx_doctor: z.string().optional(),
  eRx_diagnosis: z.string().optional(),
});

export type CreateCustomerInputType = z.infer<typeof CreateCustomerInput>;

export const UpdateCustomerInput = CreateCustomerInput.partial();
export type UpdateCustomerInputType = z.infer<typeof UpdateCustomerInput>;

export const CreateCustomerPrescriptionInput = z.object({
  date: z.string().datetime().optional(),
  source: z.string().optional(),

  far_r_pd: z.string().optional(),
  far_r_sph: z.string().optional(),
  far_r_cyl: z.string().optional(),
  far_r_aks: z.string().optional(),
  far_r_note: z.string().optional(),
  far_l_pd: z.string().optional(),
  far_l_sph: z.string().optional(),
  far_l_cyl: z.string().optional(),
  far_l_aks: z.string().optional(),
  far_l_note: z.string().optional(),

  near_r_pd: z.string().optional(),
  near_r_sph: z.string().optional(),
  near_r_cyl: z.string().optional(),
  near_r_aks: z.string().optional(),
  near_r_note: z.string().optional(),
  near_l_pd: z.string().optional(),
  near_l_sph: z.string().optional(),
  near_l_cyl: z.string().optional(),
  near_l_aks: z.string().optional(),
  near_l_note: z.string().optional(),

  lens_r_bc: z.string().optional(),
  lens_r_sph: z.string().optional(),
  lens_r_cyl: z.string().optional(),
  lens_r_aks: z.string().optional(),
  lens_r_add: z.string().optional(),
  lens_r_note: z.string().optional(),
  lens_l_bc: z.string().optional(),
  lens_l_sph: z.string().optional(),
  lens_l_cyl: z.string().optional(),
  lens_l_aks: z.string().optional(),
  lens_l_add: z.string().optional(),
  lens_l_note: z.string().optional(),

  eRx_no: z.string().optional(),
  eRx_date: z.string().optional(),
  eRx_hospital: z.string().optional(),
  eRx_doctor: z.string().optional(),
  eRx_diagnosis: z.string().optional(),
});
export type CreateCustomerPrescriptionInputType = z.infer<typeof CreateCustomerPrescriptionInput>;

