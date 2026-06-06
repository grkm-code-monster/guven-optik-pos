from odoo import models, fields


class ResPartnerGuven(models.Model):
    _inherit = 'res.partner'

    guven_prescription_ids = fields.One2many(
        'guven.prescription', 'partner_id', string='Reçeteler'
    )
