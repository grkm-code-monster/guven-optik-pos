import { VARSAYILAN_AYAR } from '../src/components/etiket-tasarimci/sablon-registry.ts'
import { ORNEK_SABLON_VERI, type SablonVeri } from '../src/components/etiket-tasarimci/sablon-types.ts'
import { gs1ReferansSatirlari } from '../src/components/etiket-tasarimci/sablon-utils.ts'
import { uretSablonZpl } from '../src/components/etiket-tasarimci/sablon-zpl.ts'

const ayar = { ...VARSAYILAN_AYAR }

const utsLi: SablonVeri = {
  ...ORNEK_SABLON_VERI,
  utsKodu: '08681234567890',
  barkod: '8693283900499',
  lotNo: 'LOT-2024-001',
  seriNo: 'SN-123456',
  sktTarihi: '260624',
}

const utsSiz: SablonVeri = {
  ...ORNEK_SABLON_VERI,
  utsKodu: '',
  lotNo: 'LOT-99',
  seriNo: 'SERI-88',
}

console.log('=== UTS\'li referans satirlari ===')
console.log(gs1ReferansSatirlari(utsLi).join('\n'))

console.log('\n=== UTS\'siz referans satirlari ===')
console.log(gs1ReferansSatirlari(utsSiz).join('\n'))

console.log('\n=== gunes-aksesuar ZPL (UTS\'li) ===')
const zplUts = uretSablonZpl('gunes-aksesuar', utsLi, ayar)
console.log(zplUts)

const checks = [
  ['^PW816', 'label width'],
  ['^LL160', 'label height'],
  ['^FO334,16', 'barcode pos'],
  ['^FO334,58', 'barcode no'],
  ['^FO290,74', 'urun adi'],
  ['^FO388,112', 'fiyat'],
  ['^FO569,18', 'gs1 matrix'],
  ['^FO665,38', 'ref line 1'],
  ['^FO665,54', 'ref line 2'],
]

let ok = true
for (const [needle, label] of checks) {
  if (!zplUts.includes(needle)) {
    console.error(`FAIL: ${label} missing (${needle})`)
    ok = false
  }
}

console.log('\n=== optik-cerceve-uts ZPL (regression) ===')
const zplOptik = uretSablonZpl('optik-cerceve-uts', utsLi, ayar)
console.log(zplOptik.includes('^FO95,30') ? 'OK: urun adi coord' : 'FAIL: urun adi')
console.log(zplOptik.includes('^FO678,220') ? 'OK: gs1 ref start' : 'FAIL: gs1 ref')
console.log(zplOptik.includes('(17) 260624') ? 'OK: SKT AI line' : 'FAIL: SKT line')

console.log(ok ? '\nALL GUNES CHECKS PASSED' : '\nSOME CHECKS FAILED')
process.exit(ok ? 0 : 1)
