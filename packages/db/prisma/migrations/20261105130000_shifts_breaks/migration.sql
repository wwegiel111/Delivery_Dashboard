-- AlterTable
ALTER TABLE "scheduling_params" ADD COLUMN     "break_minutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "breaks_per_shift" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "last_arrival" TEXT NOT NULL DEFAULT '20:00',
ADD COLUMN     "shift_change" TEXT NOT NULL DEFAULT '14:00',
ADD COLUMN     "shift_change_minutes" INTEGER NOT NULL DEFAULT 20,
ALTER COLUMN "slot_minutes" SET DEFAULT 5,
ALTER COLUMN "crews" SET DEFAULT 2;

