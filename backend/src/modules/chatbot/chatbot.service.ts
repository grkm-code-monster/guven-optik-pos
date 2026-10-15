import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { CHATBOT_CONFIG, systemPromptOlustur } from './chatbot-system-prompt';

// NOT (15.10.2026): Daha önce Anthropic (Claude) API kullanılıyordu, ancak
// ücretli (minimum $5 bakiye) olduğu için ücretsiz katmanı olan Google Gemini'ye
// geçildi. Ayrı bir SDK paketi eklemek yerine (deploy sırasında "npm install
// eksik kaldı" gibi ek bir hata kaynağı olmasın diye) doğrudan Gemini REST
// API'sine fetch ile istek atıyoruz — bağımlılık yok, sadece GEMINI_API_KEY
// ortam değişkeni gerekiyor. Key'i https://aistudio.google.com/apikey adresinden
// ücretsiz (kredi kartı istemeden) almak mümkün.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function kullanimiKontrolEt(
  userId: string,
  role?: Role,
): Promise<{
  kullanabilir: boolean;
  kalanHak: number;
  toplamKullanim: number;
  yenilemeTarihi?: Date;
}> {
  if (role === Role.ADMIN) {
    return {
      kullanabilir: true,
      kalanHak: CHATBOT_CONFIG.limitPerUser,
      toplamKullanim: 0,
    };
  }

  const kayit = await prisma.chatbotKullanim.findUnique({
    where: { userId },
  });

  if (!kayit) {
    return { kullanabilir: true, kalanHak: CHATBOT_CONFIG.limitPerUser, toplamKullanim: 0 };
  }

  const birYilOnce = new Date();
  birYilOnce.setMonth(birYilOnce.getMonth() - CHATBOT_CONFIG.limitResetMonths);

  if (kayit.ilkKullanimAt < birYilOnce) {
    await prisma.chatbotKullanim.update({
      where: { userId },
      data: { kullanimSayisi: 0, ilkKullanimAt: new Date() },
    });
    return { kullanabilir: true, kalanHak: CHATBOT_CONFIG.limitPerUser, toplamKullanim: 0 };
  }

  const kalan = CHATBOT_CONFIG.limitPerUser - kayit.kullanimSayisi;
  const yenilemeTarihi = new Date(kayit.ilkKullanimAt);
  yenilemeTarihi.setMonth(yenilemeTarihi.getMonth() + CHATBOT_CONFIG.limitResetMonths);

  return {
    kullanabilir: kalan > 0,
    kalanHak: Math.max(0, kalan),
    toplamKullanim: kayit.kullanimSayisi,
    yenilemeTarihi,
  };
}

async function kullanimiArtir(userId: string) {
  await prisma.chatbotKullanim.upsert({
    where: { userId },
    create: { userId, kullanimSayisi: 1, ilkKullanimAt: new Date() },
    update: { kullanimSayisi: { increment: 1 } },
  });
}

interface GeminiPart {
  text: string;
}
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export async function mesajGonder(
  userId: string,
  userRole: string,
  userBranch: string,
  mesaj: string,
  gecmisMesajlar: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<{
  basarili: boolean;
  yanit?: string;
  kalanHak?: number;
  hata?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { basarili: false, hata: 'Chatbot yapılandırması eksik (GEMINI_API_KEY).' };
  }

  const kullanim = await kullanimiKontrolEt(userId, userRole as Role);
  if (!kullanim.kullanabilir) {
    const tarih = kullanim.yenilemeTarihi?.toLocaleDateString('tr-TR');
    return {
      basarili: false,
      hata: `Mesaj limitiniz doldu (${CHATBOT_CONFIG.limitPerUser} mesaj). ${tarih} tarihinde yenilenecek.`,
    };
  }

  try {
    // Gemini'de roller "user" / "model" — Anthropic'teki "assistant" yerine
    // "model" kullanılıyor.
    const contents: GeminiContent[] = [
      ...gecmisMesajlar.map((m) => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: m.content }],
      })),
      { role: 'user' as const, parts: [{ text: mesaj }] },
    ];

    const res = await fetch(
      `${GEMINI_API_URL}/${CHATBOT_CONFIG.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPromptOlustur(userRole, userBranch) }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: CHATBOT_CONFIG.maxTokens,
          },
        }),
      },
    );

    const data: any = await res.json();

    if (!res.ok) {
      const gemHata = data?.error?.message ?? `Gemini API hatası (HTTP ${res.status})`;
      return { basarili: false, hata: gemHata };
    }

    const yanit: string =
      data?.candidates?.[0]?.content?.parts?.map((p: GeminiPart) => p.text).join('') ?? '';

    if (!yanit) {
      const bitisSebebi = data?.candidates?.[0]?.finishReason;
      return {
        basarili: false,
        hata: bitisSebebi
          ? `Gemini yanıt üretmedi (sebep: ${bitisSebebi})`
          : 'Gemini boş yanıt döndü.',
      };
    }

    if (userRole !== Role.ADMIN) {
      await kullanimiArtir(userId);
    }

    const yeniKullanim = await kullanimiKontrolEt(userId, userRole as Role);

    return {
      basarili: true,
      yanit,
      kalanHak: yeniKullanim.kalanHak,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { basarili: false, hata: message };
  }
}
