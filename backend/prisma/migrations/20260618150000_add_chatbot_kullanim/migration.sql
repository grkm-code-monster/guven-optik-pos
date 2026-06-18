CREATE TABLE "ChatbotKullanim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kullanimSayisi" INTEGER NOT NULL DEFAULT 0,
    "ilkKullanimAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotKullanim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatbotKullanim_userId_key" ON "ChatbotKullanim"("userId");
