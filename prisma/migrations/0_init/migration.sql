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
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
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
    "projectId" INTEGER,
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
    "tg_id" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "avatarUrl" TEXT,
    "roleId" INTEGER NOT NULL,
    "isIntern" BOOLEAN NOT NULL DEFAULT false,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagersPlan" (
    "id" SERIAL NOT NULL,
    "period" TEXT NOT NULL,
    "plan" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ManagersPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerReport" (
    "id" SERIAL NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "makets" INTEGER NOT NULL DEFAULT 0,
    "maketsDayToDay" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "redirectToMSG" INTEGER NOT NULL DEFAULT 0,
    "shiftCost" DOUBLE PRECISION NOT NULL DEFAULT 666.67,
    "isIntern" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "ManagerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RopReport" (
    "id" SERIAL NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "makets" INTEGER NOT NULL DEFAULT 0,
    "maketsDayToDay" INTEGER NOT NULL DEFAULT 0,
    "redirectToMSG" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER,

    CONSTRAINT "RopReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salaryPay" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "workSpaceId" INTEGER NOT NULL,

    CONSTRAINT "salaryPay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salaryCorrection" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "price" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "userId" INTEGER NOT NULL,
    "workSpaceId" INTEGER NOT NULL,

    CONSTRAINT "salaryCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
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
    "card_id" TEXT NOT NULL DEFAULT '',
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
    "maketType" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "maketPresentation" TEXT NOT NULL DEFAULT '',
    "period" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservation" BOOLEAN NOT NULL DEFAULT false,
    "bookSize" TEXT NOT NULL DEFAULT '',
    "pageType" TEXT NOT NULL DEFAULT '',
    "pages" INTEGER NOT NULL DEFAULT 0,
    "courseType" TEXT NOT NULL DEFAULT '',
    "discontAmount" INTEGER NOT NULL DEFAULT 0,
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
CREATE TABLE "AdSource" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER,

    CONSTRAINT "AdSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealSource" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "workSpaceId" INTEGER NOT NULL,

    CONSTRAINT "DealSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdExpense" (
    "id" SERIAL NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT '',
    "adSourceId" INTEGER NOT NULL,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER,

    CONSTRAINT "AdExpense_pkey" PRIMARY KEY ("id")
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
    "idx" INTEGER NOT NULL DEFAULT 0,
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
    "stutus" TEXT NOT NULL DEFAULT '',
    "paymentId" TEXT NOT NULL DEFAULT '',
    "paymentLink" TEXT NOT NULL DEFAULT '',
    "isConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "terminal" TEXT NOT NULL DEFAULT '',
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER NOT NULL,
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER,

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
    "workSpaceId" INTEGER NOT NULL,
    "groupId" INTEGER,

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
    "date" TEXT NOT NULL DEFAULT '',
    "method" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "purpose" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "track" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT '',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveredDate" TEXT NOT NULL DEFAULT '',
    "cdekStatus" TEXT,
    "deletedAt" TIMESTAMP(3),
    "dealId" INTEGER NOT NULL,
    "taskId" INTEGER,
    "workSpaceId" INTEGER,
    "userId" INTEGER,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "ya_name" TEXT NOT NULL DEFAULT '',
    "size" INTEGER NOT NULL DEFAULT 0,
    "preview" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "directory" TEXT NOT NULL DEFAULT '',
    "reviewId" INTEGER NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplie" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "shipmentDate" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "deliveryMethod" TEXT NOT NULL,
    "invoice" TEXT,
    "track" TEXT,

    CONSTRAINT "Supplie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppliePosition" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "priceForItem" DOUBLE PRECISION NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "supplieId" INTEGER NOT NULL,

    CONSTRAINT "SuppliePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppliesCategories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "SuppliesCategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterRepairReport" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "grinding" INTEGER NOT NULL DEFAULT 0,
    "unpackage" INTEGER NOT NULL DEFAULT 0,
    "unpackageBig" INTEGER NOT NULL DEFAULT 0,
    "smartContr" INTEGER NOT NULL DEFAULT 0,
    "acoustics" INTEGER NOT NULL DEFAULT 0,
    "metrs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "els" INTEGER NOT NULL DEFAULT 0,
    "penaltyCost" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "isPenalty" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT NOT NULL DEFAULT '',
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER,

    CONSTRAINT "MasterRepairReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterReport" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metrs" DOUBLE PRECISION NOT NULL,
    "els" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "penaltyCost" INTEGER NOT NULL DEFAULT 0,
    "isPenalty" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT NOT NULL DEFAULT '',
    "lightingType" TEXT NOT NULL DEFAULT '',
    "lightingLength" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lightingElements" INTEGER NOT NULL DEFAULT 0,
    "lightingCost" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER,
    "orderId" INTEGER,

    CONSTRAINT "MasterReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackerReport" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "overSize" BOOLEAN NOT NULL,
    "isGift" BOOLEAN NOT NULL,
    "items" INTEGER NOT NULL,
    "adapters" INTEGER NOT NULL DEFAULT 0,
    "lam" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL,
    "dimmers" INTEGER NOT NULL,
    "dops" INTEGER NOT NULL DEFAULT 0,
    "dopsComment" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "isPenalty" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT NOT NULL DEFAULT '',
    "penaltyCost" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER,
    "taskId" INTEGER,

    CONSTRAINT "PackerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MasterShift" (
    "id" SERIAL NOT NULL,
    "shift_date" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "MasterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackerShift" (
    "id" SERIAL NOT NULL,
    "shift_date" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "PackerShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogistShift" (
    "id" SERIAL NOT NULL,
    "shift_date" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "LogistShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherReport" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" INTEGER NOT NULL,
    "penaltyCost" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "userId" INTEGER NOT NULL,
    "dealId" INTEGER,
    "taskId" INTEGER,

    CONSTRAINT "OtherReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FrezerReport" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,
    "sheets" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remake" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hours" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "square" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',
    "penaltyCost" INTEGER NOT NULL DEFAULT 0,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "FrezerReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "parentId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanFactAccount" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT '',
    "balanceStartDate" TEXT NOT NULL DEFAULT '',
    "comment" TEXT NOT NULL DEFAULT '',
    "isReal" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanFactAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" SERIAL NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationDate" TEXT NOT NULL,
    "operationDateTime" TIMESTAMP(3) NOT NULL,
    "typeOfOperation" TEXT NOT NULL DEFAULT '',
    "operationType" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "payPurpose" TEXT NOT NULL DEFAULT '',
    "isCreated" BOOLEAN NOT NULL DEFAULT false,
    "accountId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterParty" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT '',
    "inn" TEXT NOT NULL DEFAULT '',
    "kpp" TEXT NOT NULL DEFAULT '',
    "account" TEXT NOT NULL DEFAULT '',
    "bankBic" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "contrAgentGroup" TEXT NOT NULL DEFAULT '',
    "incomeExpenseCategoryId" INTEGER,
    "outcomeExpenseCategoryId" INTEGER,
    "incomeProjectId" INTEGER,
    "outcomeProjectId" INTEGER,

    CONSTRAINT "CounterParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoCategoryRule" (
    "id" SERIAL NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT[],
    "operationType" TEXT NOT NULL,
    "accountIds" INTEGER[],
    "counterPartyIds" INTEGER[],
    "expenseCategoryId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationPosition" (
    "id" SERIAL NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "period" TEXT,
    "operationId" INTEGER,
    "originalOperationId" INTEGER,
    "counterPartyId" INTEGER,
    "expenseCategoryId" INTEGER,
    "projectId" INTEGER,

    CONSTRAINT "OperationPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OriginalOperationFromTbank" (
    "id" SERIAL NOT NULL,
    "operationId" TEXT NOT NULL,
    "operationDate" TEXT NOT NULL,
    "typeOfOperation" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payPurpose" TEXT NOT NULL,
    "accountAmount" DOUBLE PRECISION NOT NULL,
    "counterPartyAccount" TEXT NOT NULL,
    "counterPartyInn" TEXT NOT NULL,
    "counterPartyKpp" TEXT NOT NULL,
    "counterPartyBic" TEXT NOT NULL,
    "counterPartyBankName" TEXT NOT NULL,
    "counterPartyTitle" TEXT NOT NULL,
    "expenseCategoryId" INTEGER,
    "expenseCategoryName" TEXT,
    "accountId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OriginalOperationFromTbank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TbankSyncStatus" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "lastSyncDate" TIMESTAMP(3) NOT NULL,
    "lastOperationDate" TEXT NOT NULL,
    "totalOperations" INTEGER NOT NULL DEFAULT 0,
    "syncStatus" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TbankSyncStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Board" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Column" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "position" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "boardId" INTEGER NOT NULL,

    CONSTRAINT "Column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColumnSubscription" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "columnId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noticeType" TEXT NOT NULL DEFAULT 'all',

    CONSTRAINT "ColumnSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanTask" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" DECIMAL(10,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "cover" TEXT,
    "chatLink" TEXT,
    "creatorId" INTEGER NOT NULL,
    "boardId" INTEGER NOT NULL,
    "columnId" INTEGER NOT NULL,
    "dealId" INTEGER,

    CONSTRAINT "KanbanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanTaskComments" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "authorId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,

    CONSTRAINT "KanbanTaskComments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanTaskTags" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boardId" INTEGER NOT NULL,

    CONSTRAINT "KanbanTaskTags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanTaskAudit" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "description" TEXT,

    CONSTRAINT "KanbanTaskAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanFile" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "ya_name" TEXT NOT NULL DEFAULT '',
    "size" INTEGER NOT NULL DEFAULT 0,
    "preview" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "directory" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT,
    "file" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "uploadedById" INTEGER NOT NULL,
    "commentId" INTEGER,

    CONSTRAINT "KanbanFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KanbanTaskAttachment" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "fileId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KanbanTaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOrder" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "deadline" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL DEFAULT '',
    "boardWidth" INTEGER NOT NULL DEFAULT 0,
    "boardHeight" INTEGER NOT NULL DEFAULT 0,
    "holeType" TEXT NOT NULL DEFAULT '',
    "holeInfo" TEXT NOT NULL DEFAULT '',
    "stand" BOOLEAN NOT NULL DEFAULT false,
    "laminate" TEXT NOT NULL DEFAULT '',
    "print" BOOLEAN NOT NULL DEFAULT false,
    "printQuality" BOOLEAN NOT NULL DEFAULT false,
    "acrylic" TEXT NOT NULL DEFAULT '',
    "isAcrylic" BOOLEAN NOT NULL DEFAULT false,
    "screen" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT '',
    "wireLength" TEXT NOT NULL DEFAULT '',
    "wireInfo" TEXT NOT NULL DEFAULT '',
    "wireType" TEXT NOT NULL DEFAULT 'Акустический',
    "elements" INTEGER NOT NULL DEFAULT 0,
    "gift" BOOLEAN NOT NULL DEFAULT false,
    "adapter" TEXT NOT NULL DEFAULT '',
    "adapterInfo" TEXT NOT NULL DEFAULT '',
    "adapterModel" TEXT NOT NULL DEFAULT '',
    "plug" TEXT NOT NULL DEFAULT '',
    "plugColor" TEXT NOT NULL DEFAULT '',
    "plugLength" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "switch" BOOLEAN NOT NULL DEFAULT true,
    "fitting" TEXT NOT NULL DEFAULT '',
    "dimmer" BOOLEAN NOT NULL DEFAULT false,
    "dimmerType" TEXT NOT NULL DEFAULT '',
    "giftPack" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL DEFAULT '',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "docs" BOOLEAN NOT NULL DEFAULT false,
    "dealId" INTEGER,
    "taskId" INTEGER NOT NULL,

    CONSTRAINT "TaskOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCost" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "taskId" INTEGER NOT NULL,
    "dealId" INTEGER,
    "boardId" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calcVersion" INTEGER NOT NULL DEFAULT 1,
    "priceForBoard" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "priceForScreen" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "neonPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lightingPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "wirePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adapterPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "plugPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "packageCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "dimmerPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "boardWidth" INTEGER NOT NULL DEFAULT 0,
    "boardHeight" INTEGER NOT NULL DEFAULT 0,
    "polikSquare" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "policPerimetr" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pazLength" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lightingsLength" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "wireLength" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "print" BOOLEAN NOT NULL DEFAULT false,
    "screen" BOOLEAN NOT NULL DEFAULT false,
    "dimmer" BOOLEAN NOT NULL DEFAULT false,
    "wireType" TEXT NOT NULL DEFAULT '',
    "adapterModel" TEXT NOT NULL DEFAULT '',
    "plug" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageItem" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "desc" TEXT NOT NULL DEFAULT '',
    "cost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "packageId" INTEGER NOT NULL,

    CONSTRAINT "PackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neon" (
    "id" SERIAL NOT NULL,
    "width" TEXT NOT NULL DEFAULT '',
    "length" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '',
    "orderTaskId" INTEGER NOT NULL,

    CONSTRAINT "Neon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lighting" (
    "id" SERIAL NOT NULL,
    "length" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '',
    "elements" INTEGER NOT NULL DEFAULT 0,
    "orderTaskId" INTEGER NOT NULL,

    CONSTRAINT "Lighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdReport" (
    "id" SERIAL NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProdReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomer" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL DEFAULT '',
    "birthday" TEXT NOT NULL DEFAULT '',
    "sex" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "otherContacts" TEXT NOT NULL DEFAULT '',
    "firstContactDate" TEXT NOT NULL DEFAULT '',
    "lastContactDate" TEXT NOT NULL DEFAULT '',
    "nextContactDate" TEXT NOT NULL DEFAULT '',
    "shortNotes" TEXT NOT NULL DEFAULT '',
    "comments" TEXT NOT NULL DEFAULT '',
    "countryId" INTEGER,
    "cityId" INTEGER,
    "crmStatusId" INTEGER,
    "sourceId" INTEGER,
    "salesChannelId" INTEGER,
    "managerId" INTEGER,
    "vkId" INTEGER,
    "avitoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCountry" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "CrmCountry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCity" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "CrmCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmStatus" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "type" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrmStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSource" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,

    CONSTRAINT "CrmSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSalesChannel" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "code" INTEGER NOT NULL DEFAULT 0,
    "name" TEXT NOT NULL,

    CONSTRAINT "CrmSalesChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmManager" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "login" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "vk" TEXT,
    "lastLoginDate" TEXT NOT NULL DEFAULT '',
    "lastActivityDate" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "permissions" JSONB,

    CONSTRAINT "CrmManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmVk" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "messagesGroupId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CrmVk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmAvito" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chatId" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CrmAvito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTag" (
    "id" SERIAL NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '',
    "textColor" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CrmTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmCustomerTag" (
    "id" SERIAL NOT NULL,
    "customerId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "CrmCustomerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmSyncState" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "lastDailyImportDate" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VkAdsDailyStat" (
    "id" SERIAL NOT NULL,
    "project" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT,
    "name" TEXT,
    "budgetLimitDay" TEXT,
    "adGroupId" INTEGER,
    "adGroups" INTEGER[],
    "banners" INTEGER[],
    "refs" TEXT[],
    "total" JSONB,
    "dealsPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "makets" INTEGER NOT NULL DEFAULT 0,
    "spentNds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maketPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VkAdsDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PnlSnapshot" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "anchorPeriod" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PnlSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BoardUsers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_BoardUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TaskMembers" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_TaskMembers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_TaskTags" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_TaskTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSpace_title_key" ON "WorkSpace"("title");

-- CreateIndex
CREATE INDEX "Group_projectId_idx" ON "Group"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_shortName_key" ON "Role"("shortName");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_chatLink_key" ON "Client"("chatLink");

-- CreateIndex
CREATE INDEX "Deal_saleDate_groupId_idx" ON "Deal"("saleDate", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSource_title_key" ON "AdSource"("title");

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
CREATE INDEX "Dop_saleDate_groupId_idx" ON "Dop"("saleDate", "groupId");

-- CreateIndex
CREATE INDEX "Dop_dealId_idx" ON "Dop"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "DopsType_title_key" ON "DopsType"("title");

-- CreateIndex
CREATE INDEX "Delivery_taskId_idx" ON "Delivery"("taskId");

-- CreateIndex
CREATE INDEX "Delivery_date_idx" ON "Delivery"("date");

-- CreateIndex
CREATE INDEX "Delivery_dealId_idx" ON "Delivery"("dealId");

-- CreateIndex
CREATE INDEX "Supplie_shipmentDate_idx" ON "Supplie"("shipmentDate");

-- CreateIndex
CREATE INDEX "SuppliePosition_category_supplieId_idx" ON "SuppliePosition"("category", "supplieId");

-- CreateIndex
CREATE INDEX "SuppliePosition_supplieId_idx" ON "SuppliePosition"("supplieId");

-- CreateIndex
CREATE UNIQUE INDEX "Suppliers_name_key" ON "Suppliers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PlanFactAccount_accountNumber_key" ON "PlanFactAccount"("accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_operationId_key" ON "Operation"("operationId");

-- CreateIndex
CREATE INDEX "CounterParty_incomeProjectId_idx" ON "CounterParty"("incomeProjectId");

-- CreateIndex
CREATE INDEX "CounterParty_outcomeProjectId_idx" ON "CounterParty"("outcomeProjectId");

-- CreateIndex
CREATE INDEX "AutoCategoryRule_enabled_priority_idx" ON "AutoCategoryRule"("enabled", "priority");

-- CreateIndex
CREATE INDEX "OperationPosition_originalOperationId_idx" ON "OperationPosition"("originalOperationId");

-- CreateIndex
CREATE INDEX "OperationPosition_operationId_idx" ON "OperationPosition"("operationId");

-- CreateIndex
CREATE INDEX "OperationPosition_counterPartyId_idx" ON "OperationPosition"("counterPartyId");

-- CreateIndex
CREATE INDEX "OperationPosition_expenseCategoryId_idx" ON "OperationPosition"("expenseCategoryId");

-- CreateIndex
CREATE INDEX "OperationPosition_projectId_idx" ON "OperationPosition"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "OriginalOperationFromTbank_operationId_key" ON "OriginalOperationFromTbank"("operationId");

-- CreateIndex
CREATE INDEX "OriginalOperationFromTbank_accountId_operationDate_idx" ON "OriginalOperationFromTbank"("accountId", "operationDate");

-- CreateIndex
CREATE UNIQUE INDEX "TbankSyncStatus_accountId_key" ON "TbankSyncStatus"("accountId");

-- CreateIndex
CREATE INDEX "Board_deletedAt_idx" ON "Board"("deletedAt");

-- CreateIndex
CREATE INDEX "Column_boardId_position_idx" ON "Column"("boardId", "position");

-- CreateIndex
CREATE INDEX "Column_deletedAt_idx" ON "Column"("deletedAt");

-- CreateIndex
CREATE INDEX "ColumnSubscription_columnId_idx" ON "ColumnSubscription"("columnId");

-- CreateIndex
CREATE UNIQUE INDEX "ColumnSubscription_userId_columnId_key" ON "ColumnSubscription"("userId", "columnId");

-- CreateIndex
CREATE INDEX "KanbanTask_boardId_columnId_position_idx" ON "KanbanTask"("boardId", "columnId", "position");

-- CreateIndex
CREATE INDEX "KanbanTask_dealId_idx" ON "KanbanTask"("dealId");

-- CreateIndex
CREATE INDEX "KanbanTask_dealId_boardId_idx" ON "KanbanTask"("dealId", "boardId");

-- CreateIndex
CREATE INDEX "KanbanTask_deletedAt_idx" ON "KanbanTask"("deletedAt");

-- CreateIndex
CREATE INDEX "KanbanTaskComments_taskId_createdAt_idx" ON "KanbanTaskComments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "KanbanTaskComments_deletedAt_idx" ON "KanbanTaskComments"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanTaskTags_boardId_name_key" ON "KanbanTaskTags"("boardId", "name");

-- CreateIndex
CREATE INDEX "KanbanTaskAudit_taskId_createdAt_idx" ON "KanbanTaskAudit"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "KanbanFile_deletedAt_idx" ON "KanbanFile"("deletedAt");

-- CreateIndex
CREATE INDEX "KanbanFile_uploadedById_idx" ON "KanbanFile"("uploadedById");

-- CreateIndex
CREATE INDEX "KanbanTaskAttachment_taskId_idx" ON "KanbanTaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "KanbanTaskAttachment_fileId_idx" ON "KanbanTaskAttachment"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "KanbanTaskAttachment_taskId_fileId_key" ON "KanbanTaskAttachment"("taskId", "fileId");

-- CreateIndex
CREATE INDEX "TaskOrder_taskId_idx" ON "TaskOrder"("taskId");

-- CreateIndex
CREATE INDEX "TaskOrder_dealId_idx" ON "TaskOrder"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCost_orderId_key" ON "OrderCost"("orderId");

-- CreateIndex
CREATE INDEX "OrderCost_taskId_idx" ON "OrderCost"("taskId");

-- CreateIndex
CREATE INDEX "OrderCost_dealId_idx" ON "OrderCost"("dealId");

-- CreateIndex
CREATE INDEX "OrderCost_orderId_idx" ON "OrderCost"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Package_orderId_key" ON "Package"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCustomer_externalId_key" ON "CrmCustomer"("externalId");

-- CreateIndex
CREATE INDEX "CrmCustomer_externalId_idx" ON "CrmCustomer"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCountry_externalId_key" ON "CrmCountry"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCity_externalId_key" ON "CrmCity"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmStatus_externalId_key" ON "CrmStatus"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSource_externalId_key" ON "CrmSource"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSalesChannel_externalId_key" ON "CrmSalesChannel"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmManager_externalId_key" ON "CrmManager"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmVk_externalId_key" ON "CrmVk"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmAvito_externalId_key" ON "CrmAvito"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTag_externalId_key" ON "CrmTag"("externalId");

-- CreateIndex
CREATE INDEX "CrmCustomerTag_tagId_idx" ON "CrmCustomerTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmCustomerTag_customerId_tagId_key" ON "CrmCustomerTag"("customerId", "tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmSyncState_key_key" ON "CrmSyncState"("key");

-- CreateIndex
CREATE INDEX "VkAdsDailyStat_project_entity_date_idx" ON "VkAdsDailyStat"("project", "entity", "date");

-- CreateIndex
CREATE UNIQUE INDEX "vkads_unique_entity_per_day" ON "VkAdsDailyStat"("project", "entity", "entityId", "date");

-- CreateIndex
CREATE INDEX "PnlSnapshot_type_computedAt_idx" ON "PnlSnapshot"("type", "computedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pnl_snapshot_unique_type_period" ON "PnlSnapshot"("type", "anchorPeriod");

-- CreateIndex
CREATE INDEX "_BoardUsers_B_index" ON "_BoardUsers"("B");

-- CreateIndex
CREATE INDEX "_TaskMembers_B_index" ON "_TaskMembers"("B");

-- CreateIndex
CREATE INDEX "_TaskTags_B_index" ON "_TaskTags"("B");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "ManagerReport" ADD CONSTRAINT "ManagerReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RopReport" ADD CONSTRAINT "RopReport_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RopReport" ADD CONSTRAINT "RopReport_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaryPay" ADD CONSTRAINT "salaryPay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaryPay" ADD CONSTRAINT "salaryPay_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaryCorrection" ADD CONSTRAINT "salaryCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaryCorrection" ADD CONSTRAINT "salaryCorrection_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "AdSource" ADD CONSTRAINT "AdSource_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSource" ADD CONSTRAINT "AdSource_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealSource" ADD CONSTRAINT "DealSource_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExpense" ADD CONSTRAINT "AdExpense_adSourceId_fkey" FOREIGN KEY ("adSourceId") REFERENCES "AdSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExpense" ADD CONSTRAINT "AdExpense_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdExpense" ADD CONSTRAINT "AdExpense_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealUser" ADD CONSTRAINT "DealUser_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealUser" ADD CONSTRAINT "DealUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dop" ADD CONSTRAINT "Dop_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KanbanTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_workSpaceId_fkey" FOREIGN KEY ("workSpaceId") REFERENCES "WorkSpace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppliePosition" ADD CONSTRAINT "SuppliePosition_supplieId_fkey" FOREIGN KEY ("supplieId") REFERENCES "Supplie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterRepairReport" ADD CONSTRAINT "MasterRepairReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterRepairReport" ADD CONSTRAINT "MasterRepairReport_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterReport" ADD CONSTRAINT "MasterReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterReport" ADD CONSTRAINT "MasterReport_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackerReport" ADD CONSTRAINT "PackerReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackerReport" ADD CONSTRAINT "PackerReport_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterShift" ADD CONSTRAINT "MasterShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackerShift" ADD CONSTRAINT "PackerShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogistShift" ADD CONSTRAINT "LogistShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherReport" ADD CONSTRAINT "OtherReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherReport" ADD CONSTRAINT "OtherReport_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FrezerReport" ADD CONSTRAINT "FrezerReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Operation" ADD CONSTRAINT "Operation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlanFactAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterParty" ADD CONSTRAINT "CounterParty_incomeExpenseCategoryId_fkey" FOREIGN KEY ("incomeExpenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterParty" ADD CONSTRAINT "CounterParty_outcomeExpenseCategoryId_fkey" FOREIGN KEY ("outcomeExpenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterParty" ADD CONSTRAINT "CounterParty_incomeProjectId_fkey" FOREIGN KEY ("incomeProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterParty" ADD CONSTRAINT "CounterParty_outcomeProjectId_fkey" FOREIGN KEY ("outcomeProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPosition" ADD CONSTRAINT "OperationPosition_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "Operation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPosition" ADD CONSTRAINT "OperationPosition_originalOperationId_fkey" FOREIGN KEY ("originalOperationId") REFERENCES "OriginalOperationFromTbank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPosition" ADD CONSTRAINT "OperationPosition_counterPartyId_fkey" FOREIGN KEY ("counterPartyId") REFERENCES "CounterParty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPosition" ADD CONSTRAINT "OperationPosition_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationPosition" ADD CONSTRAINT "OperationPosition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OriginalOperationFromTbank" ADD CONSTRAINT "OriginalOperationFromTbank_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlanFactAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TbankSyncStatus" ADD CONSTRAINT "TbankSyncStatus_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlanFactAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Column" ADD CONSTRAINT "Column_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColumnSubscription" ADD CONSTRAINT "ColumnSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ColumnSubscription" ADD CONSTRAINT "ColumnSubscription_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "Column"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTask" ADD CONSTRAINT "KanbanTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskComments" ADD CONSTRAINT "KanbanTaskComments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskComments" ADD CONSTRAINT "KanbanTaskComments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KanbanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskTags" ADD CONSTRAINT "KanbanTaskTags_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskAudit" ADD CONSTRAINT "KanbanTaskAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskAudit" ADD CONSTRAINT "KanbanTaskAudit_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KanbanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanFile" ADD CONSTRAINT "KanbanFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanFile" ADD CONSTRAINT "KanbanFile_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "KanbanTaskComments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskAttachment" ADD CONSTRAINT "KanbanTaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KanbanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KanbanTaskAttachment" ADD CONSTRAINT "KanbanTaskAttachment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "KanbanFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrder" ADD CONSTRAINT "TaskOrder_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrder" ADD CONSTRAINT "TaskOrder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "KanbanTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCost" ADD CONSTRAINT "OrderCost_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TaskOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TaskOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageItem" ADD CONSTRAINT "PackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Neon" ADD CONSTRAINT "Neon_orderTaskId_fkey" FOREIGN KEY ("orderTaskId") REFERENCES "TaskOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lighting" ADD CONSTRAINT "Lighting_orderTaskId_fkey" FOREIGN KEY ("orderTaskId") REFERENCES "TaskOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "CrmCountry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "CrmCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_crmStatusId_fkey" FOREIGN KEY ("crmStatusId") REFERENCES "CrmStatus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CrmSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "CrmSalesChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "CrmManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_vkId_fkey" FOREIGN KEY ("vkId") REFERENCES "CrmVk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomer" ADD CONSTRAINT "CrmCustomer_avitoId_fkey" FOREIGN KEY ("avitoId") REFERENCES "CrmAvito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomerTag" ADD CONSTRAINT "CrmCustomerTag_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CrmCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmCustomerTag" ADD CONSTRAINT "CrmCustomerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "CrmTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BoardUsers" ADD CONSTRAINT "_BoardUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BoardUsers" ADD CONSTRAINT "_BoardUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskMembers" ADD CONSTRAINT "_TaskMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "KanbanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskMembers" ADD CONSTRAINT "_TaskMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTags" ADD CONSTRAINT "_TaskTags_A_fkey" FOREIGN KEY ("A") REFERENCES "KanbanTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskTags" ADD CONSTRAINT "_TaskTags_B_fkey" FOREIGN KEY ("B") REFERENCES "KanbanTaskTags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

