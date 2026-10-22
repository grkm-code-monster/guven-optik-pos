/**
 * Salt-okunur: "envanter-import-sablon GÜNEŞ 1.xlsx" dosyasindaki, barkodu
 * boş olan 176 satir icin, CANLI Odoo'da (product.product + nitelik
 * degerleri: MODEL/RENK/ÖLÇÜ) ayni urunun daha once girilip girilmedigini
 * arar. Hicbir sey YAZMAZ, sadece ne bulundugunu raporlar.
 *
 * 22.10.2026 — liste 36'dan 176'ya guncellendi (dosyanin guncel halinde
 * barkodu bos olan TUM satirlar, maliyet dolum calismasindan sonraki hal).
 *
 * AYRICA: bu markalarda (GÜNEŞ GÖZLÜĞÜ / çerçeve) kullanilan placeholder
 * barkod serisinin ("86800000000" + 2(+) haneli sira no — ör. 8680000000024)
 * su ana kadar en son hangi numaraya kadar geldigini bulur, boylece hic
 * bulunamayan satirlara bu serinin DEVAMINDAN numara onerilebilir.
 *
 * Kullanim:
 *   cd backend
 *   npm run gunes-canli-barkod-tamamla
 */
import 'dotenv/config';
import { execute } from '../src/modules/odoo/odoo.service';

const GUNES_PLACEHOLDER_ONEKI = '86800000000';

type HedefSatir = { rownum: number; ad: string; model: string; renk: string; olcu: number };

const HEDEF_SATIRLAR: HedefSatir[] = [
  { rownum: 2, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'MS310PG', renk: 'C2', olcu: 58 },
  { rownum: 3, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '6265PG', renk: 'C2', olcu: 47 },
  { rownum: 4, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00020PG', renk: 'C3', olcu: 54 },
  { rownum: 5, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00024PG', renk: 'C6', olcu: 47 },
  { rownum: 6, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00007PG', renk: 'C5', olcu: 50 },
  { rownum: 7, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '2522PG', renk: 'C6', olcu: 55 },
  { rownum: 8, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00024PG', renk: 'C4', olcu: 47 },
  { rownum: 9, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00019PG', renk: 'C6', olcu: 47 },
  { rownum: 10, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '1093PG', renk: 'C9', olcu: 52 },
  { rownum: 11, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00024PG', renk: 'C5', olcu: 47 },
  { rownum: 12, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1123PG', renk: 'C12', olcu: 51 },
  { rownum: 13, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1097PG', renk: 'C7', olcu: 53 },
  { rownum: 14, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1123PG', renk: 'C9', olcu: 51 },
  { rownum: 15, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1123PG', renk: 'C8', olcu: 51 },
  { rownum: 16, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00009PG', renk: 'C3', olcu: 45 },
  { rownum: 17, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00024PG', renk: 'C2', olcu: 47 },
  { rownum: 18, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '1097PG', renk: 'C12', olcu: 53 },
  { rownum: 19, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'MS231PG', renk: 'C58', olcu: 45 },
  { rownum: 20, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00025PG', renk: 'C6', olcu: 52 },
  { rownum: 21, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00019PG', renk: 'C2', olcu: 47 },
  { rownum: 22, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1126PG', renk: 'C7', olcu: 51 },
  { rownum: 23, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '10092PG', renk: 'C4', olcu: 52 },
  { rownum: 24, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1123PG', renk: 'C7', olcu: 51 },
  { rownum: 25, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1126PG', renk: 'C4', olcu: 51 },
  { rownum: 26, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1123PG', renk: 'C4', olcu: 51 },
  { rownum: 27, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1126PG', renk: 'C8', olcu: 51 },
  { rownum: 28, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '1092PG', renk: 'C8', olcu: 52 },
  { rownum: 29, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1126PG', renk: 'C12', olcu: 51 },
  { rownum: 30, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'VG1126PG', renk: 'C9', olcu: 51 },
  { rownum: 31, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: '1092PG', renk: 'C9', olcu: 52 },
  { rownum: 32, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG000021PG', renk: 'C2', olcu: 48 },
  { rownum: 33, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00021PG', renk: 'C2', olcu: 48 },
  { rownum: 34, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00019PG', renk: 'C2', olcu: 47 },
  { rownum: 35, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00019PG', renk: 'C3', olcu: 47 },
  { rownum: 36, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00022PG', renk: 'C4', olcu: 50 },
  { rownum: 37, ad: '1959 EYEWEAR GÜNEŞ GÖZLÜĞÜ', model: 'SG00024PG', renk: 'C3', olcu: 47 },
  { rownum: 38, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: '2224AG', renk: 'C3', olcu: 51 },
  { rownum: 39, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: '2227AG', renk: 'C3', olcu: 50 },
  { rownum: 40, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: '2225AG', renk: 'C3', olcu: 50 },
  { rownum: 41, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: '2229AG', renk: 'C1M', olcu: 48 },
  { rownum: 42, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2225AG', renk: 'C4', olcu: 50 },
  { rownum: 43, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2227AG', renk: 'C4', olcu: 50 },
  { rownum: 44, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2233VG', renk: 'C2', olcu: 51 },
  { rownum: 45, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2224VG', renk: 'C4', olcu: 51 },
  { rownum: 46, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2225AG', renk: 'C2', olcu: 50 },
  { rownum: 47, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2225AG', renk: 'C1M', olcu: 50 },
  { rownum: 48, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2233VG', renk: 'C1M', olcu: 51 },
  { rownum: 49, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2224AG', renk: 'C1M', olcu: 51 },
  { rownum: 50, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2224AG', renk: 'C1M', olcu: 51 },
  { rownum: 51, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2229AG', renk: 'C4', olcu: 48 },
  { rownum: 52, ad: 'ALLIGATOR GÜNEŞ GÖZLÜĞÜ', model: 'M2228AG', renk: 'C2', olcu: 51 },
  { rownum: 53, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: '1013AG', renk: 'C1', olcu: 54 },
  { rownum: 54, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'VNT2200AG', renk: 'C2', olcu: 51 },
  { rownum: 55, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: '1013AG', renk: 'C4', olcu: 54 },
  { rownum: 56, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: '202AG', renk: 'C40', olcu: 48 },
  { rownum: 57, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'J5519AG', renk: 'C8', olcu: 53 },
  { rownum: 58, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'VNT2119AG', renk: 'C3', olcu: 57 },
  { rownum: 59, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'J500AG', renk: 'C3', olcu: 56 },
  { rownum: 60, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'VNT2119AG', renk: 'C2', olcu: 57 },
  { rownum: 61, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'MS116AG', renk: 'C2', olcu: 45 },
  { rownum: 62, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'MS109AG', renk: 'C10', olcu: 48 },
  { rownum: 63, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: '1087SG', renk: 'C321', olcu: 49 },
  { rownum: 64, ad: 'ALYSON SASSO GÜNEŞ GÖZLÜĞÜ', model: 'VNT2202AG', renk: 'C1', olcu: 48 },
  { rownum: 65, ad: 'BENX GÜNEŞ GÖZLÜĞÜ', model: '8001BG', renk: 'C3', olcu: 58 },
  { rownum: 71, ad: 'DE VALAENTINI GÜNEŞ GÖZLÜĞÜ', model: 'VG1073DG', renk: 'C6', olcu: 49 },
  { rownum: 105, ad: 'HAWK GÜNEŞ GÖZLÜĞÜ', model: 'HW2264HG', renk: 'C2', olcu: 58 },
  { rownum: 115, ad: 'HAWK GÜNEŞ GÖZLÜĞÜ', model: 'HW2329HG', renk: 'C3', olcu: 55 },
  { rownum: 116, ad: 'HAWK GÜNEŞ GÖZLÜĞÜ', model: 'HW2261HG', renk: 'C3', olcu: 55 },
  { rownum: 117, ad: 'HAWK GÜNEŞ GÖZLÜĞÜ', model: 'HW2026HG', renk: 'C1', olcu: 56 },
  { rownum: 121, ad: 'HAWK GÜNEŞ GÖZLÜĞÜ', model: 'HW1999HG', renk: 'C2', olcu: 55 },
  { rownum: 132, ad: 'HELENA RUBENSTEIN GÜNEŞ GÖZLÜĞÜ', model: 'HR2214HG', renk: 'C4', olcu: 49 },
  { rownum: 145, ad: 'LACOSTE GÜNEŞ GÖZLÜĞÜ', model: 'L6030SLG', renk: 'C1', olcu: 50 },
  { rownum: 150, ad: 'MARCO SALVADORI GÜNEŞ GÖZLÜĞÜ', model: 'MS118MG', renk: 'C214', olcu: 55 },
  { rownum: 151, ad: 'MARCO SALVADORI GÜNEŞ GÖZLÜĞÜ', model: 'MS127MG', renk: 'C30', olcu: 52 },
  { rownum: 152, ad: 'MASSIMO MILANO GÜNEŞ GÖZLÜĞÜ', model: '3014MG', renk: 'C3', olcu: 57 },
  { rownum: 160, ad: 'MUSTANG GÜNEŞ GÖZLÜĞÜ', model: 'MU2658MG', renk: 'C1', olcu: 56 },
  { rownum: 173, ad: 'MUSTANG GÜNEŞ GÖZLÜĞÜ', model: 'MU1749MG', renk: 'C3', olcu: 51 },
  { rownum: 174, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '6021OG', renk: 'C104P', olcu: 60 },
  { rownum: 175, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8542OG', renk: 'C202P', olcu: 62 },
  { rownum: 176, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8542OG', renk: 'C405P', olcu: 62 },
  { rownum: 177, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8581OG', renk: 'C111P', olcu: 53 },
  { rownum: 178, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '86066OG', renk: 'C405P', olcu: 49 },
  { rownum: 179, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8573OA', renk: 'C212P', olcu: 48 },
  { rownum: 180, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8577OG', renk: 'C202P', olcu: 50 },
  { rownum: 181, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '3851OG', renk: 'C201P', olcu: 52 },
  { rownum: 182, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8542OG', renk: 'C101M', olcu: 62 },
  { rownum: 183, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '6021OG', renk: 'C303M', olcu: 60 },
  { rownum: 184, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8542OG', renk: 'C101P', olcu: 62 },
  { rownum: 185, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8951OG', renk: 'C122M', olcu: 52 },
  { rownum: 186, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8573OG', renk: 'C202P', olcu: 48 },
  { rownum: 187, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8580OG', renk: 'C101P', olcu: 54 },
  { rownum: 188, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8580OG', renk: 'C505P', olcu: 54 },
  { rownum: 189, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8540OG', renk: 'C303M', olcu: 55 },
  { rownum: 190, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8581OG', renk: 'C2P', olcu: 53 },
  { rownum: 191, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8951OG', renk: 'C102P', olcu: 52 },
  { rownum: 192, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8566OG', renk: 'C202P', olcu: 52 },
  { rownum: 193, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '3850OG', renk: 'C2P', olcu: 56 },
  { rownum: 194, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '3850OG', renk: 'C505P', olcu: 56 },
  { rownum: 195, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8540OG', renk: 'C405M', olcu: 55 },
  { rownum: 196, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '3850OG', renk: 'C101O', olcu: 56 },
  { rownum: 197, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '8582OG', renk: 'C111P', olcu: 56 },
  { rownum: 198, ad: 'OLIVER ARJE GÜNEŞ GÖZLÜĞÜ', model: '3851OG', renk: 'C2P', olcu: 52 },
  { rownum: 201, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3256OG', renk: 'C3', olcu: 55 },
  { rownum: 214, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3827OG', renk: 'C3', olcu: 54 },
  { rownum: 217, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3700OG', renk: 'C2', olcu: 52 },
  { rownum: 221, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3210OG', renk: 'C5', olcu: 54 },
  { rownum: 222, ad: 'OSSE GÜNEŞ GÖZLÜĞÜ', model: 'OS3109OG', renk: 'C5', olcu: 50 },
  { rownum: 239, ad: 'POLO EXCHANGE GÜNEŞ GÖZLÜĞÜ', model: 'AYD2026PG', renk: 'C4', olcu: 50 },
  { rownum: 240, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1880PG', renk: 'C1', olcu: 55 },
  { rownum: 241, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C1', olcu: 62 },
  { rownum: 242, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1802PG', renk: 'C12', olcu: 50 },
  { rownum: 243, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C2', olcu: 62 },
  { rownum: 244, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1809PG', renk: 'C12', olcu: 58 },
  { rownum: 245, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2672PG', renk: 'C6', olcu: 58 },
  { rownum: 246, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV6008PG', renk: 'C2', olcu: 52 },
  { rownum: 247, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: '5029AG', renk: 'C6', olcu: 53 },
  { rownum: 248, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2429PG', renk: 'C1', olcu: 52 },
  { rownum: 249, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2647PG', renk: 'C2', olcu: 58 },
  { rownum: 250, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: '5019PG', renk: 'C2', olcu: 53 },
  { rownum: 251, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV6010PG', renk: 'C2', olcu: 56 },
  { rownum: 252, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: '5019PG', renk: 'C5', olcu: 53 },
  { rownum: 253, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2251PG', renk: 'C1', olcu: 58 },
  { rownum: 254, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1803PG', renk: 'C4', olcu: 47 },
  { rownum: 255, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2250PG', renk: 'C1', olcu: 62 },
  { rownum: 256, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'AYD2030AG', renk: 'C4', olcu: 49 },
  { rownum: 257, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C2', olcu: 62 },
  { rownum: 258, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2251PG', renk: 'C5', olcu: 58 },
  { rownum: 259, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C1', olcu: 62 },
  { rownum: 260, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV1810PG', renk: 'C1', olcu: 62 },
  { rownum: 261, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2662PG', renk: 'C3', olcu: 55 },
  { rownum: 262, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2611PG', renk: 'C5', olcu: 55 },
  { rownum: 263, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2662PG', renk: 'C5', olcu: 55 },
  { rownum: 264, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: '5004PG', renk: 'C2', olcu: 56 },
  { rownum: 265, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2623PG', renk: 'C1', olcu: 60 },
  { rownum: 266, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2611PG', renk: 'C2', olcu: 55 },
  { rownum: 267, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2640PG', renk: 'C1', olcu: 54 },
  { rownum: 268, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV6030PG', renk: 'C1', olcu: 53 },
  { rownum: 269, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2612PG', renk: 'C1', olcu: 55 },
  { rownum: 270, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2662PG', renk: 'C1', olcu: 55 },
  { rownum: 271, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2612PG', renk: 'C1', olcu: 55 },
  { rownum: 272, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2662PG', renk: 'C1', olcu: 55 },
  { rownum: 273, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2611PG', renk: 'C5', olcu: 55 },
  { rownum: 274, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2672PG', renk: 'C3', olcu: 58 },
  { rownum: 275, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2501PG', renk: 'C2', olcu: 49 },
  { rownum: 276, ad: 'POLO VILLAGE GÜNEŞ GÖZLÜĞÜ', model: 'PV2501PG', renk: 'C1', olcu: 49 },
  { rownum: 277, ad: 'PYER MOSS GÜNEŞ GÖZLÜĞÜ', model: 'JUNOPG', renk: 'C2', olcu: 44 },
  { rownum: 278, ad: 'PYER MOSS GÜNEŞ GÖZLÜĞÜ', model: 'NELLPG', renk: 'C2', olcu: 42 },
  { rownum: 279, ad: 'PYER MOSS GÜNEŞ GÖZLÜĞÜ', model: 'NELLPG', renk: 'C1', olcu: 42 },
  { rownum: 300, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'MC1838SG', renk: 'C5', olcu: 55 },
  { rownum: 301, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS337SG', renk: 'C13', olcu: 50 },
  { rownum: 302, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS220SG', renk: 'C3', olcu: 49 },
  { rownum: 303, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'TR344SO', renk: 'C6M', olcu: 50 },
  { rownum: 304, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SE343SG', renk: 'C4', olcu: 54 },
  { rownum: 305, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS220SG', renk: 'C2', olcu: 49 },
  { rownum: 306, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS320SG', renk: 'CRB01', olcu: 49 },
  { rownum: 307, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'MC1819SG', renk: 'C3', olcu: 55 },
  { rownum: 309, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SE344SG', renk: 'C5', olcu: 55 },
  { rownum: 310, ad: 'SWING GÜNEŞ GÖZLÜĞÜ', model: 'SS220SG', renk: 'C290', olcu: 49 },
  { rownum: 329, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS147TG', renk: 'C2', olcu: 50 },
  { rownum: 330, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: '7052TG', renk: 'C34', olcu: 51 },
  { rownum: 331, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS121TG', renk: 'C6', olcu: 52 },
  { rownum: 332, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: '300TG', renk: 'C1', olcu: 56 },
  { rownum: 333, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS163TG', renk: 'C10', olcu: 49 },
  { rownum: 334, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS169TG', renk: 'C233', olcu: 50 },
  { rownum: 335, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: '7052TG', renk: 'C34', olcu: 51 },
  { rownum: 336, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: '7052TG', renk: 'C8', olcu: 51 },
  { rownum: 337, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS184TG', renk: 'C42', olcu: 51 },
  { rownum: 338, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'VG1059TG', renk: 'C7', olcu: 53 },
  { rownum: 339, ad: 'TWENTY1 GÜNEŞ GÖZLÜĞÜ', model: 'MS180TG', renk: 'C3', olcu: 47 },
  { rownum: 340, ad: 'VIVALDI GÜNEŞ GÖZLÜĞÜ', model: 'M2224VG', renk: 'C2', olcu: 51 },
  { rownum: 341, ad: 'VIVALDI GÜNEŞ GÖZLÜĞÜ', model: 'M2233VG', renk: 'C1M', olcu: 51 },
  { rownum: 342, ad: 'VIVALDI GÜNEŞ GÖZLÜĞÜ', model: 'M2225VG', renk: 'C1M', olcu: 50 },
  { rownum: 343, ad: 'ZEISS GÜNEŞ GÖZLÜĞÜ', model: 'ZS22108SZG', renk: 'C460', olcu: 55 },
  { rownum: 344, ad: 'ZEISS GÜNEŞ GÖZLÜĞÜ', model: 'ZS22108SZG', renk: 'C460', olcu: 55 },
  { rownum: 345, ad: 'ZEISS GÜNEŞ GÖZLÜĞÜ', model: 'ZS22513SZG', renk: 'C412', olcu: 57 },
  { rownum: 346, ad: 'QUANTUM OPTİK ÇERÇEVE', model: 'Q626QO', renk: 'C2', olcu: 50 },
];

function normTight(s: string | null | undefined): string {
  if (!s) return '';
  let t = s.trim().toUpperCase();
  const repl: Record<string, string> = { İ: 'I', Ü: 'U', Ö: 'O', Ş: 'S', Ç: 'C', Ğ: 'G' };
  for (const [k, v] of Object.entries(repl)) t = t.split(k).join(v);
  return t.replace(/[^A-Z0-9]/g, '');
}

function normRenk(s: string | null | undefined): string {
  const t = normTight(s);
  return t.replace(/\d+/g, (m) => String(Number(m)));
}

function modelCore(s: string | null | undefined): string {
  const t = normTight(s);
  const m = t.match(/^(.*\d)([A-Z]+)$/);
  return m ? m[1] : t;
}

function similarity(a: string, b: string): number {
  // basit Dice/ortak karakter benzerligi (SequenceMatcher yerine kaba bir yaklasim)
  if (!a || !b) return 0;
  if (a === b) return 1;
  const setA = new Set(a);
  const setB = new Set(b);
  let common = 0;
  for (const c of setA) if (setB.has(c)) common++;
  return (2 * common) / (a.length + b.length);
}

function gercekciBarkod(b: string | null | undefined): boolean {
  if (!b) return false;
  const s = String(b).trim();
  if (!/^\d+$/.test(s)) return false;
  if (s.length < 8) return false; // internal kisa referans numaralari (12686 gibi) degil
  if (s.startsWith(GUNES_PLACEHOLDER_ONEKI)) return false; // placeholder, gercek degil
  return true;
}

async function main() {
  const brands = Array.from(new Set(HEDEF_SATIRLAR.map((r) => r.ad)));
  console.log(`${HEDEF_SATIRLAR.length} satir, ${brands.length} marka icin canli Odoo aranacak...\n`);

  type Varyant = { id: number; barcode: string | false; model: string | null; renk: string | null; olcu: string | null };
  const varyantlarByBrand: Record<string, Varyant[]> = {};

  for (const brand of brands) {
    const variants = (await execute(
      'product.product', 'search_read',
      [[['product_tmpl_id.name', '=', brand]]],
      { fields: ['id', 'barcode', 'product_template_attribute_value_ids'], limit: 2000, context: { active_test: false } },
    )) as Array<{ id: number; barcode: string | false; product_template_attribute_value_ids: number[] }>;

    const allAttrIds = Array.from(new Set(variants.flatMap((v) => v.product_template_attribute_value_ids || [])));
    let attrMap: Record<number, { name: string; attrName: string }> = {};
    if (allAttrIds.length) {
      const attrs = (await execute(
        'product.template.attribute.value', 'read',
        [allAttrIds],
        { fields: ['id', 'name', 'attribute_id'], context: { active_test: false } },
      )) as Array<{ id: number; name: string; attribute_id: [number, string] }>;
      attrMap = Object.fromEntries(attrs.map((a) => [a.id, { name: a.name, attrName: a.attribute_id[1] }]));
    }

    const parsed: Varyant[] = variants.map((v) => {
      let model: string | null = null;
      let renk: string | null = null;
      let olcu: string | null = null;
      for (const id of v.product_template_attribute_value_ids || []) {
        const a = attrMap[id];
        if (!a) continue;
        if (a.attrName === 'MODEL') model = a.name;
        else if (a.attrName === 'RENK') renk = a.name;
        else if (a.attrName === 'ÖLÇÜ') olcu = a.name;
      }
      return { id: v.id, barcode: v.barcode, model, renk, olcu };
    });
    varyantlarByBrand[brand] = parsed;
    console.log(`  ${brand}: ${parsed.length} varyant cekildi`);
  }

  console.log('\n=== ESLESTIRME SONUCLARI ===\n');
  const bulunanlar: Array<{ rownum: number; barkod: string }> = [];
  const bulunamayanlar: HedefSatir[] = [];

  for (const hedef of HEDEF_SATIRLAR) {
    const cands = varyantlarByBrand[hedef.ad] || [];
    const tcore = modelCore(hedef.model);
    const tcoreDigits = tcore.replace(/\D/g, '');
    let best: Varyant | null = null;
    let bestScore = -1;
    let second: Varyant | null = null;
    let secondScore = -1;

    for (const c of cands) {
      const renkScore = c.renk ? similarity(normRenk(hedef.renk), normRenk(c.renk)) : 0;
      const exactRenk = c.renk && normRenk(hedef.renk) === normRenk(c.renk) ? 1 : 0;
      const modelScore = c.model ? similarity(normTight(hedef.model), normTight(c.model)) : 0;
      const refTight = c.model ? normTight(c.model) : '';
      const refDigits = refTight.replace(/\D/g, '');
      const coreHit = tcore && refTight.includes(tcore) ? 1 : 0;
      const digitHit = !coreHit && tcoreDigits.length >= 3 && refDigits.includes(tcoreDigits) ? 1 : 0;
      let widthScore = 0;
      if (c.olcu) {
        const cw = Number((c.olcu.match(/\d+/) || [])[0]);
        if (Number.isFinite(cw) && Number.isFinite(hedef.olcu)) {
          widthScore = Math.max(0, 1 - Math.abs(hedef.olcu - cw) / 10);
        }
      }
      const score = coreHit * 8 + digitHit * 6 + exactRenk * 5 + renkScore * 2 + modelScore * 1.5 + widthScore * 1;
      // Renk (renk kodu) TUTMUYORSA bu aday asla "best" olamaz — barkod
      // renge/SKU'ya ozeldir, model ayni olsa da farkli renkteki bir
      // urunun barkodunu kullanmak YANLIS kayit/mukerrer riski yaratir.
      if (!exactRenk) continue;
      if (score > bestScore) {
        second = best; secondScore = bestScore;
        best = c; bestScore = score;
      } else if (score > secondScore) {
        second = c; secondScore = score;
      }
    }

    const belirsiz = best && second && bestScore > 0 && (bestScore - secondScore) <= 0.75
      && String(best.barcode || '') !== String(second.barcode || '');

    if (best && bestScore >= 3 && !belirsiz && gercekciBarkod(best.barcode)) {
      console.log(`  satir${hedef.rownum} ${hedef.ad} ${hedef.model}/${hedef.renk}/${hedef.olcu} -> CANLI BULUNDU: barkod=${best.barcode} (ref model=${best.model} renk=${best.renk} olcu=${best.olcu}, skor=${bestScore.toFixed(2)})`);
      bulunanlar.push({ rownum: hedef.rownum, barkod: String(best.barcode) });
    } else {
      console.log(`  satir${hedef.rownum} ${hedef.ad} ${hedef.model}/${hedef.renk}/${hedef.olcu} -> BULUNAMADI${belirsiz ? ' (belirsiz)' : ''}${best ? ` (en yakin: ${best.model}/${best.renk}/${best.olcu} barkod=${best.barcode}, skor=${bestScore.toFixed(2)})` : ''}`);
      bulunamayanlar.push(hedef);
    }
  }

  console.log(`\nCANLI BULUNAN: ${bulunanlar.length} / ${HEDEF_SATIRLAR.length}`);
  console.log(`HALA BULUNAMAYAN: ${bulunamayanlar.length}`);

  // ---- Placeholder seri max tespiti ----
  // Gorkem'in hatirladigina gore seri 1200+'e kadar gitmis olabilir — daha
  // dar onek ("868") ile GENIS bir arama yaparak farkli uzunluk/sifirlama
  // varyasyonlarini da (0868..., 868XXXXXXXXXX gibi) yakalamaya calisiyoruz.
  const GENIS_ONEK = '868';
  const genisUrunler = (await execute(
    'product.product', 'search_read',
    [[['barcode', 'like', GENIS_ONEK]]],
    { fields: ['barcode'], limit: 20000, context: { active_test: false } },
  )) as Array<{ barcode: string | false }>;
  const genisLotlar = (await execute(
    'stock.lot', 'search_read',
    [[['ref', 'like', GENIS_ONEK]]],
    { fields: ['ref'], limit: 20000, context: { active_test: false } },
  )) as Array<{ ref: string | false }>;
  console.log(`\n(Genis tarama: "${GENIS_ONEK}" iceren ${genisUrunler.length} urun barkodu + ${genisLotlar.length} lot referansi bulundu)`);
  const benzersizBarkodlar = new Set<string>();
  for (const v of [...genisUrunler.map((p) => p.barcode), ...genisLotlar.map((l) => l.ref)]) {
    if (typeof v === 'string' && v.trim()) benzersizBarkodlar.add(v.trim());
  }
  // En uzun/en cok tekrar eden onek kaliplarini goster (ilk 8 karaktere gore grupla)
  const onekSayaclari: Record<string, number> = {};
  for (const b of benzersizBarkodlar) {
    const onek8 = b.slice(0, 8);
    onekSayaclari[onek8] = (onekSayaclari[onek8] || 0) + 1;
  }
  console.log('Benzersiz barkod/ref sayisi (868 iceren):', benzersizBarkodlar.size);
  console.log('Ilk-8-karakter onek dagilimi (en cok tekrar eden 15):');
  Object.entries(onekSayaclari).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  "${k}..." -> ${v} kayit`));

  const [urunler, lotlar] = await Promise.all([
    execute(
      'product.product', 'search_read',
      [[['barcode', 'like', GUNES_PLACEHOLDER_ONEKI]]],
      { fields: ['barcode'], limit: 5000, context: { active_test: false } },
    ) as Promise<Array<{ barcode: string | false }>>,
    execute(
      'stock.lot', 'search_read',
      [[['ref', 'like', GUNES_PLACEHOLDER_ONEKI]]],
      { fields: ['ref'], limit: 5000, context: { active_test: false } },
    ) as Promise<Array<{ ref: string | false }>>,
  ]);
  // "DELETE_86800000000123" gibi arsivlenmis/silinmis kayitlar da onekin
  // SUBSTRING'i olarak eslesiyor (Odoo'nun 'like' operatoru substring arar)
  // ama startsWith() bunlari atlar. indexOf kullanarak onek NEREDE olursa
  // olsun (DELETE_ ile basliyorsa bile) sonrasindaki sira numarasini al —
  // boylece arsivlenmis eski numaralar da "kullanilmis" sayilir, cakisma
  // riskini sifira indirir.
  let maxSuffix = 0;
  let maxSuffixKaynak = '';
  for (const deger of [...urunler.map((p) => p.barcode), ...lotlar.map((l) => l.ref)]) {
    const bc = typeof deger === 'string' ? deger.trim() : '';
    const idx = bc.indexOf(GUNES_PLACEHOLDER_ONEKI);
    if (idx === -1) continue;
    const kalan = bc.slice(idx + GUNES_PLACEHOLDER_ONEKI.length);
    const m = kalan.match(/^(\d+)/);
    if (!m) continue;
    const suffix = Number(m[1]);
    if (Number.isFinite(suffix) && suffix > maxSuffix) {
      maxSuffix = suffix;
      maxSuffixKaynak = bc;
    }
  }
  console.log(`\nPLACEHOLDER SERI (${GUNES_PLACEHOLDER_ONEKI}XX, DELETE_ onekli arsivlenmisler dahil): su ana kadar en yuksek sira no = ${maxSuffix} (kaynak kayit: "${maxSuffixKaynak}", toplam ${urunler.length + lotlar.length} kayit tarandi)`);

  // Ayni hesaplamayi daha once cekilen GENIS ("868" iceren, DELETE_ dahil
  // hepsi) veri uzerinde de tekrarla — mutlak max icin capraz dogrulama.
  let genisMaxSuffix = 0;
  let genisMaxKaynak = '';
  for (const bc of benzersizBarkodlar) {
    const idx = bc.indexOf(GUNES_PLACEHOLDER_ONEKI);
    if (idx === -1) continue;
    const kalan = bc.slice(idx + GUNES_PLACEHOLDER_ONEKI.length);
    const m = kalan.match(/^(\d+)/);
    if (!m) continue;
    const suffix = Number(m[1]);
    if (Number.isFinite(suffix) && suffix > genisMaxSuffix) {
      genisMaxSuffix = suffix;
      genisMaxKaynak = bc;
    }
  }
  console.log(`CAPRAZ DOGRULAMA (genis "868" taramasindan): en yuksek sira no = ${genisMaxSuffix} (kaynak: "${genisMaxKaynak}")`);
  maxSuffix = Math.max(maxSuffix, genisMaxSuffix);

  // Baska bir aday seri: "0868000000" ile baslayanlar (cam/lens'te kullanilan
  // CAM_TEMSILCI_BARKOD_ONEKI = '08680000001' de bu aileden) — Gorkem'in
  // hatirladigi "1200+" numara belki BU serilerden birinde.
  for (const alternatifOnek of ['08680000000', '08680000001']) {
    let altMax = 0;
    let altKaynak = '';
    for (const bc of benzersizBarkodlar) {
      const idx = bc.indexOf(alternatifOnek);
      if (idx === -1) continue;
      const kalan = bc.slice(idx + alternatifOnek.length);
      const m = kalan.match(/^(\d+)/);
      if (!m) continue;
      const suffix = Number(m[1]);
      if (Number.isFinite(suffix) && suffix > altMax) { altMax = suffix; altKaynak = bc; }
    }
    console.log(`Alternatif seri "${alternatifOnek}XXX": en yuksek sira no = ${altMax} (kaynak: "${altKaynak}")`);
  }
  console.log(`Sonraki onerilecek placeholder: ${GUNES_PLACEHOLDER_ONEKI}${String(maxSuffix + 1).padStart(2, '0')}`);

  console.log('\n=== HALA BULUNAMAYAN SATIRLARA ONERILECEK PLACEHOLDER BARKODLAR ===');
  let next = maxSuffix + 1;
  for (const h of bulunamayanlar) {
    const pb = `${GUNES_PLACEHOLDER_ONEKI}${String(next).padStart(2, '0')}`;
    console.log(`  satir${h.rownum} ${h.ad} ${h.model}/${h.renk}/${h.olcu} -> ${pb}`);
    next += 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
