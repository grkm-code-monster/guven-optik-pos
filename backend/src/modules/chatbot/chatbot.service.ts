import Anthropic from '@anthropic-ai/sdk';
import { Role } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { CHATBOT_CONFIG, systemPromptOlustur } from './chatbot-system-prompt';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  if (!process.env.ANTHROPIC_API_KEY) {
    return { basarili: false, hata: 'Chatbot yapılandırması eksik (ANTHROPIC_API_KEY).' };
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
    const mesajlar = [...gecmisMesajlar, { role: 'user' as const, content: mesaj }];

    const response = await anthropic.messages.create({
      model: CHATBOT_CONFIG.model,
      max_tokens: CHATBOT_CONFIG.maxTokens,
      system: systemPromptOlustur(userRole, userBranch),
      messages: mesajlar,
    });

    const yanit = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

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
