/**
 * JS'in yerleşik `.toLowerCase()`/`.toUpperCase()` fonksiyonları Türkçe'ye
 * özgü harfleri DOĞRU katlamaz — özellikle "İ" (U+0130, noktalı büyük I)
 * plain `.toLowerCase()` ile "i" + ayrı bir "nokta" karakterine (U+0307)
 * dönüşür, bu da düz "i" ile ASLA eşleşmez. Bu yüzden arama kutularında
 * "İzmir" yazan biri "izmir" sonucunu bulamayabiliyordu (ve tersi).
 *
 * Bu modül, Türkçe harf çiftlerini (İ/I/ı/i, Ğ/ğ, Ş/ş, Ç/ç, Ö/ö, Ü/ü) VE
 * ayrıca W/V karışıklığını (bazı ürün/marka adlarında İngilizce "W"
 * yazılıp Türkçe klavyede "V" ile aranması gibi durumlar için) tek bir
 * kanonik forma indirgeyen bir "fold" fonksiyonu sağlar. Hem arama
 * terimini hem de karşılaştırılan metni bu fonksiyondan geçirip sonra
 * düz `.includes()`/`===` yapmak, Türkçe/İngilizce yazım farklılıklarını
 * dikkate alan, büyük/küçük harf duyarsız bir karşılaştırma sağlar.
 *
 * NOT: Backend tarafında (Odoo ILIKE, Prisma `mode: 'insensitive'`) bu
 * sorun zaten YOK — veritabanı seviyesinde TR harfler doğru katlanıyor
 * (14.10.2026 tarihinde doğrulandı). Asıl sorun sadece tarayıcıda
 * (client-side filtreleme) JS'in kendi toLowerCase/toUpperCase'iydi.
 */
export function turkishFold(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/W/g, 'v')
    .replace(/w/g, 'v')
    .toLowerCase()
    .trim();
}

/** `haystack` içinde `needle` var mı — Türkçe/İngilizce yazım farklılıklarını dikkate alarak (içerir / contains mantığıyla). */
export function trIncludes(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  if (!needle) return true;
  return turkishFold(haystack).includes(turkishFold(needle));
}

/** Türkçe/İngilizce yazım farklılıklarını dikkate alan eşitlik karşılaştırması. */
export function trEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return turkishFold(a) === turkishFold(b);
}
