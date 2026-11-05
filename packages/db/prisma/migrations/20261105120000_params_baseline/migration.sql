-- AlterTable
ALTER TABLE "scheduling_params" ALTER COLUMN "slot_minutes" SET DEFAULT 10,
ALTER COLUMN "crews" SET DEFAULT 1,
ALTER COLUMN "crew_size" SET DEFAULT 2,
ALTER COLUMN "full_truck_pallets" SET DEFAULT 35,
ALTER COLUMN "dock_setup_minutes" SET DEFAULT 20,
ALTER COLUMN "buffer_capacity" SET DEFAULT 140,
ALTER COLUMN "putaway_pallets_per_hour" SET DEFAULT 90,
ALTER COLUMN "weight_buffer" SET DEFAULT 10;

