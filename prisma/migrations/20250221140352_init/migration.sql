-- CreateEnum
CREATE TYPE "DeliveryMethods" AS ENUM ('СДЕК', 'ПОЧТА_РОССИИ', 'Яндекс', 'Балтийский_курьер', 'Самовывоз', 'ТК_КИТ', 'ПЭТ', 'Боксбери', 'Деловые_линии');

-- CreateEnum
CREATE TYPE "DeliveryTypes" AS ENUM ('NONE', 'Платно', 'Бесплатно', 'Досыл');

-- CreateEnum
CREATE TYPE "DeliveryStatuses" AS ENUM ('Создана', 'Доступна', 'Отправлена', 'Вручена', 'Возврат');

-- CreateEnum
CREATE TYPE "MaterialEnum" AS ENUM ('Поликарбонат', 'ПВХ');

-- CreateEnum
CREATE TYPE "OrderTypeEnum" AS ENUM ('Помещение', 'Улица');

-- CreateEnum
CREATE TYPE "AdapterEnum" AS ENUM ('Помещение', 'Уличный', 'Нет');

-- CreateEnum
CREATE TYPE "FittingEnum" AS ENUM ('Держатели_хромированые', 'Держатели_золотые', 'Держатели_черные', 'Крепления_для_окна', 'Дюбеля', 'Присоски', 'Нет');

-- CreateEnum
CREATE TYPE "NeonWidth" AS ENUM ('6мм', '8мм', 'Подсветка');

-- CreateEnum
CREATE TYPE "NeonColor" AS ENUM ('красный', 'синий', 'голубой', 'оранжевый', 'фиолетовый', 'розовый', 'бирюзовый', 'желтый', 'зеленый', 'холодный белый', 'теплый белый', 'смарт', 'rgb');

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSpace" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workSpaceId" INTEGER NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "shortName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "info" TEXT NOT NULL DEFAULT '',
    "tg" TEXT NOT NULL DEFAULT '',
    "tg_id" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roleId" INTEGER NOT NULL,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagersPlan" (
    "id" SERIAL NOT NULL,
    "period" TIMESTAMP(3) NOT NULL,
    "plan" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ManagersPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "chatLink" TEXT NOT NULL,
    "adLink" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "inn" TEXT NOT NULL DEFAULT '',
    "info" TEXT NOT NULL DEFAULT '',
    "firstContact" TEXT NOT NULL,
    "isRegular" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" SERIAL NOT NULL,
    "saleDate" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Создана',
    "clothingMethod" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL,
    "adTag" TEXT NOT NULL,
    "discont" TEXT NOT NULL,
    "sphere" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "maketType" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "maketPresentation" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealStatusHistory" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "dealId" INTEGER NOT NULL,

    CONSTRAINT "DealStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealAudit" (
    "id" SERIAL NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealId" INTEGER NOT NULL,
    "userId" INTEGER,

    CONSTRAINT "DealAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealSource" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "workSpaceId" INTEGER NOT NULL,

    CONSTRAINT "DealSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClothingMethod" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ClothingMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdTag" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "AdTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sphere" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "Sphere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealUser" (
    "id" SERIAL NOT NULL,
    "price" INTEGER NOT NULL,
    "dealId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DealUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "reservation" BOOLEAN NOT NULL DEFAULT false,
    "period" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dop" (
    "id" SERIAL NOT NULL,
    "saleDate" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER NOT NULL,

    CONSTRAINT "Dop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DopsType" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "DopsType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "method" "DeliveryMethods" NOT NULL,
    "type" "DeliveryTypes" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "track" TEXT NOT NULL DEFAULT '',
    "status" "DeliveryStatuses" NOT NULL DEFAULT 'Создана',
    "price" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT '',
    "dealId" INTEGER NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "index" INTEGER,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "deadline" TEXT NOT NULL,
    "loadDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "material" "MaterialEnum" NOT NULL DEFAULT 'Поликарбонат',
    "boardWidth" INTEGER NOT NULL,
    "boardHeight" INTEGER NOT NULL,
    "holeType" TEXT NOT NULL DEFAULT '6мм',
    "stand" BOOLEAN NOT NULL DEFAULT false,
    "laminate" TEXT NOT NULL DEFAULT '',
    "print" BOOLEAN NOT NULL DEFAULT false,
    "printQuality" BOOLEAN NOT NULL DEFAULT false,
    "acrylic" TEXT NOT NULL DEFAULT '',
    "type" "OrderTypeEnum" NOT NULL DEFAULT 'Помещение',
    "wireLength" TEXT NOT NULL,
    "elements" INTEGER NOT NULL,
    "gift" BOOLEAN NOT NULL DEFAULT false,
    "gift_elements" INTEGER NOT NULL DEFAULT 0,
    "gift_metrs" INTEGER NOT NULL DEFAULT 0,
    "adapter" "AdapterEnum" NOT NULL,
    "plug" TEXT NOT NULL DEFAULT 'Нет',
    "fitting" "FittingEnum" NOT NULL DEFAULT 'Нет',
    "dimmer" BOOLEAN NOT NULL DEFAULT false,
    "giftPack" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "dealId" INTEGER NOT NULL,
    "stageId" INTEGER NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neon" (
    "id" SERIAL NOT NULL,
    "width" TEXT NOT NULL DEFAULT '6мм',
    "length" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Стандарт',
    "elements" INTEGER NOT NULL DEFAULT 0,
    "orderId" INTEGER NOT NULL,

    CONSTRAINT "Neon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSpace_title_key" ON "WorkSpace"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Group_title_key" ON "Group"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Role_shortName_key" ON "Role"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_chatLink_key" ON "Client"("chatLink");

-- CreateIndex
CREATE UNIQUE INDEX "DealSource_title_key" ON "DealSource"("title");

-- CreateIndex
CREATE UNIQUE INDEX "ClothingMethod_title_key" ON "ClothingMethod"("title");

-- CreateIndex
CREATE UNIQUE INDEX "AdTag_title_key" ON "AdTag"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Sphere_title_key" ON "Sphere"("title");

-- CreateIndex
CREATE UNIQUE INDEX "DealUser_dealId_userId_key" ON "DealUser"("dealId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DopsType_title_key" ON "DopsType"("title");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_title_key" ON "Stage"("title");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagersPlan" ADD CONSTRAINT "ManagersPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealStatusHistory" ADD CONSTRAINT "DealStatusHistory_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAudit" ADD CONSTRAINT "DealAudit_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAudit" ADD CONSTRAINT "DealAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealSource" ADD CONSTRAINT "DealSource_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealUser" ADD CONSTRAINT "DealUser_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealUser" ADD CONSTRAINT "DealUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Neon" ADD CONSTRAINT "Neon_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
