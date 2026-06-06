from odoo import models, fields


class GuvenPrescription(models.Model):
    _name = 'guven.prescription'
    _description = 'Reçete'
    _order = 'date desc, id desc'

    partner_id = fields.Many2one('res.partner', string='Müşteri', required=True, ondelete='cascade')
    date = fields.Date(string='Tarih')
    source = fields.Char(string='Kaynak')

    # E-Reçete
    erx_no = fields.Char(string='E-Reçete No')
    erx_hospital = fields.Char(string='Hastane')
    erx_doctor = fields.Char(string='Doktor')
    erx_diagnosis = fields.Char(string='Tanı')

    # Daimi
    far_r_sph = fields.Char(string='Sağ SPH')
    far_r_cyl = fields.Char(string='Sağ CYL')
    far_r_aks = fields.Char(string='Sağ AKS')
    far_r_pd = fields.Char(string='Sağ PD')
    far_r_add = fields.Char(string='Sağ ADD')
    far_r_note = fields.Char(string='Sağ Not')
    far_l_sph = fields.Char(string='Sol SPH')
    far_l_cyl = fields.Char(string='Sol CYL')
    far_l_aks = fields.Char(string='Sol AKS')
    far_l_pd = fields.Char(string='Sol PD')
    far_l_add = fields.Char(string='Sol ADD')
    far_l_note = fields.Char(string='Sol Not')

    # Yakın
    near_r_sph = fields.Char(string='Yakın Sağ SPH')
    near_r_cyl = fields.Char(string='Yakın Sağ CYL')
    near_r_aks = fields.Char(string='Yakın Sağ AKS')
    near_r_pd = fields.Char(string='Yakın Sağ PD')
    near_r_note = fields.Char(string='Yakın Sağ Not')
    near_l_sph = fields.Char(string='Yakın Sol SPH')
    near_l_cyl = fields.Char(string='Yakın Sol CYL')
    near_l_aks = fields.Char(string='Yakın Sol AKS')
    near_l_pd = fields.Char(string='Yakın Sol PD')
    near_l_note = fields.Char(string='Yakın Sol Not')

    # Lens
    lens_r_bc = fields.Char(string='Lens Sağ BC')
    lens_r_sph = fields.Char(string='Lens Sağ SPH')
    lens_r_cyl = fields.Char(string='Lens Sağ CYL')
    lens_r_aks = fields.Char(string='Lens Sağ AKS')
    lens_r_add = fields.Char(string='Lens Sağ ADD')
    lens_r_note = fields.Char(string='Lens Sağ Not')
    lens_l_bc = fields.Char(string='Lens Sol BC')
    lens_l_sph = fields.Char(string='Lens Sol SPH')
    lens_l_cyl = fields.Char(string='Lens Sol CYL')
    lens_l_aks = fields.Char(string='Lens Sol AKS')
    lens_l_add = fields.Char(string='Lens Sol ADD')
    lens_l_note = fields.Char(string='Lens Sol Not')
