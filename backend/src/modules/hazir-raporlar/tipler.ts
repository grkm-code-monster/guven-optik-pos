/**
 * 17.11.2026 — Hazır Raporlar (Yönetim Paneli › Raporlar).
 *
 * Her rapor bir tanımdır: kimlik, grup, ad, kısa anlatım, hangi filtreleri kullandığı,
 * (varsa) gruplama seçenekleri ve bir çalıştırma fonksiyonu. Çalıştırma fonksiyonu
 * HER ZAMAN aynı şekilde sonuç döner (kolonlar + satırlar + özet), böylece ekran ve
 * Excel çıktısı tek bir kodla bütün raporları gösterebilir.
 *
 * Bu modül HİÇBİR ŞEY YAZMAZ: sadece POS veritabanından ve Odoo'dan okur.
 */
import type { Role } from '@prisma/client';

export type FiltreAnahtar =
  | 'tarih'
  | 'sube'
  | 'lokasyon'
  | 'kategori'
  | 'marka'
  | 'ara'
  | 'personel'
  | 'musteri'
  | 'odemeTipi'
  | 'durum'
  | 'camGrubu'
  | 'enAz'
  | 'karsilastir';

export type Filtre = {
  bas?: string; // YYYY-MM-DD (Türkiye günü)
  bit?: string; // YYYY-MM-DD (dahil)
  subeIds?: string[];
  lokasyonlar?: string[]; // LOKASYON_ID_MAP anahtarları + depo kodları
  kategori?: string;
  marka?: string;
  ara?: string;
  personelId?: string;
  musteriId?: string;
  odemeTipi?: string;
  durum?: string;
  camGrubu?: string;
  enAz?: number;
  gruplama?: string;
  karsilastir?: boolean;
};

export type KolonTip = 'metin' | 'sayi' | 'para' | 'yuzde' | 'tarih' | 'tarihSaat';

export type Kolon = {
  key: string;
  label: string;
  tip: KolonTip;
  /** Toplam satırında toplansın mı */
  toplam?: boolean;
  /** Maliyet / kâr / alış bilgisi — sadece yetkiliye gösterilir */
  maliyet?: boolean;
};

export type OzetKutu = { ad: string; deger: number | string; tip: KolonTip; maliyet?: boolean; alt?: string };

export type Satir = Record<string, string | number | null>;

export type RaporSonuc = {
  kolonlar: Kolon[];
  satirlar: Satir[];
  ozet?: OzetKutu[];
  notlar?: string[];
  /** Satır sınırına takıldıysa true (ekranda uyarı) */
  kesildi?: boolean;
};

export type CalistirmaBaglami = {
  userId: string;
  role: Role;
  maliyetGorur: boolean;
};

export type RaporGrup = 'SATIS' | 'STOK' | 'KAREKOD' | 'KASA' | 'CARI' | 'LISTE';

export type RaporTanim = {
  id: string;
  grup: RaporGrup;
  ad: string;
  aciklama: string;
  siber: string;
  filtreler: FiltreAnahtar[];
  /** Zorunlu filtre (örn. müşteri ekstresi için müşteri) */
  zorunlu?: FiltreAnahtar[];
  gruplamalar?: { key: string; label: string }[];
  varsayilanGruplama?: string;
  durumlar?: { key: string; label: string }[];
  /** Ekranda tarih seçiminin varsayılanı */
  varsayilanTarih?: 'bugun' | 'buAy' | 'son30' | 'yok';
  calistir: (f: Filtre, ctx: CalistirmaBaglami) => Promise<RaporSonuc>;
};

export const GRUP_ADLARI: Record<RaporGrup, string> = {
  SATIS: 'Satış',
  STOK: 'Stok',
  KAREKOD: 'Karekod / ÜTS',
  KASA: 'Kasa ve tahsilat',
  CARI: 'Cari ve müşteri',
  LISTE: 'Listeler',
};

export class RaporHatasi extends Error {}
