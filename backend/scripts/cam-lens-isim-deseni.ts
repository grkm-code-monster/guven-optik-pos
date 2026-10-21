/**
 * Cam/Lens "Ürün Şablonu" adlarının tipik formatına uyan isimleri ayıklamak
 * için GÜVENLİK deseni — ör. "1.56 Org Et -0200-0200", "1.67 Hi-Index
 * -0400-0200" gibi dioptri/sıra kodu içeren adlar. teshis-cam-tip-kilidi-
 * toplu.ts ve sablon-tip-serbest-toplu-duzelt.ts, type != 'product' olan
 * TÜM şablonları (ör. "Göz Muayenesi", "Kargo" gibi GERÇEK hizmet kalemleri
 * dahil) yanlışlıkla toplu düzeltmesin diye bu deseni ortak kullanıyor.
 *
 * Desen: sonunda "-dddd-dddd" (ya da 3 haneli) tarzı bir dioptri çifti VEYA
 * başında "1.xx"/"1.x" tarzı bir kırılma indisi arıyor.
 */
export const CAM_LENS_ISIM_DESENI = /-\d{3,4}-\d{3,4}\s*$|^\s*1[.,]\d{1,2}\b/i;
