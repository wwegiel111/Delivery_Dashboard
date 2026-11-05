-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PLANNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('SOLVING', 'OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'ERROR');

-- CreateTable
CREATE TABLE "dock" (
    "id" SERIAL NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_params" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "slot_minutes" INTEGER NOT NULL DEFAULT 15,
    "crews" INTEGER NOT NULL DEFAULT 2,
    "crew_size" INTEGER NOT NULL DEFAULT 4,
    "full_truck_minutes" INTEGER NOT NULL DEFAULT 60,
    "full_truck_pallets" INTEGER NOT NULL DEFAULT 33,
    "dock_setup_minutes" INTEGER NOT NULL DEFAULT 15,
    "buffer_capacity" INTEGER NOT NULL DEFAULT 35,
    "putaway_pallets_per_hour" INTEGER NOT NULL DEFAULT 32,
    "work_from" TEXT NOT NULL DEFAULT '06:00',
    "work_to" TEXT NOT NULL DEFAULT '22:00',
    "weight_tardiness" INTEGER NOT NULL DEFAULT 1000,
    "weight_makespan" INTEGER NOT NULL DEFAULT 50,
    "weight_flow" INTEGER NOT NULL DEFAULT 5,
    "weight_buffer" INTEGER NOT NULL DEFAULT 1,
    "solver_time_limit_s" INTEGER NOT NULL DEFAULT 20,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_params_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery" (
    "id" SERIAL NOT NULL,
    "waybill_number" TEXT NOT NULL,
    "supplier" TEXT,
    "carrier" TEXT NOT NULL,
    "carrier_email" TEXT,
    "truck_plate" TEXT,
    "delivery_date" DATE NOT NULL,
    "window_from" TIMESTAMPTZ(3),
    "window_to" TIMESTAMPTZ(3),
    "hard_window" BOOLEAN NOT NULL DEFAULT false,
    "pallets" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "notes" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PLANNED',
    "imported_from" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_run" (
    "id" SERIAL NOT NULL,
    "plan_date" DATE NOT NULL,
    "horizon_start" TIMESTAMPTZ(3) NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'SOLVING',
    "params_id" INTEGER NOT NULL,
    "relaxed" BOOLEAN NOT NULL DEFAULT false,
    "objective_value" DOUBLE PRECISION,
    "wall_time_ms" INTEGER,
    "kpis" JSONB,
    "hints" JSONB,
    "error_message" TEXT,
    "request_payload" JSONB NOT NULL,
    "response_payload" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_assignment" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "delivery_id" INTEGER NOT NULL,
    "dock_id" INTEGER NOT NULL,
    "crew" INTEGER NOT NULL,
    "arrival_at" TIMESTAMPTZ(3) NOT NULL,
    "unload_start_at" TIMESTAMPTZ(3) NOT NULL,
    "unload_end_at" TIMESTAMPTZ(3) NOT NULL,
    "arrival_slot" INTEGER NOT NULL,
    "start_slot" INTEGER NOT NULL,
    "end_slot" INTEGER NOT NULL,
    "late_by_slots" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "schedule_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dock_number_key" ON "dock"("number");

-- CreateIndex
CREATE UNIQUE INDEX "scheduling_params_version_key" ON "scheduling_params"("version");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_waybill_number_key" ON "delivery"("waybill_number");

-- CreateIndex
CREATE INDEX "delivery_delivery_date_status_idx" ON "delivery"("delivery_date", "status");

-- CreateIndex
CREATE INDEX "schedule_run_plan_date_created_at_idx" ON "schedule_run"("plan_date", "created_at");

-- CreateIndex
CREATE INDEX "schedule_assignment_run_id_arrival_slot_idx" ON "schedule_assignment"("run_id", "arrival_slot");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_assignment_run_id_delivery_id_key" ON "schedule_assignment"("run_id", "delivery_id");

-- AddForeignKey
ALTER TABLE "schedule_run" ADD CONSTRAINT "schedule_run_params_id_fkey" FOREIGN KEY ("params_id") REFERENCES "scheduling_params"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignment" ADD CONSTRAINT "schedule_assignment_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "schedule_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignment" ADD CONSTRAINT "schedule_assignment_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignment" ADD CONSTRAINT "schedule_assignment_dock_id_fkey" FOREIGN KEY ("dock_id") REFERENCES "dock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
