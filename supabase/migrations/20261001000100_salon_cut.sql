-- Percentual da dona do salão (ata diária). Idempotente.
alter table public.booking_settings
  add column if not exists salon_cut_percent numeric(5, 2) not null default 30;

do $$ begin
  alter table public.booking_settings
    add constraint booking_settings_salon_cut_percent_check
    check (salon_cut_percent >= 0 and salon_cut_percent <= 100);
exception when duplicate_object then null;
end $$;
