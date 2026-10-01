-- =====================================================================
-- OPCIONAL: serviços de exemplo para começar mais rápido.
-- Rode apenas se quiser. Depois ajuste nomes, preços e fotos pelo painel
-- (Serviços e preços). Pode ser executado no SQL Editor do Supabase.
-- =====================================================================
insert into public.services
  (name, type, duration_minutes, price_cents, price_is_from, description, featured, sort_order, maintenance_interval_days, maintenance_rules)
values
  ('Fio a fio clássico', 'aplicacao', 120, 16000, false,
   'Um fio sintético sobre cada fio natural. Efeito rímel, natural e delicado.', true, 1, 18, null),
  ('Volume brasileiro', 'aplicacao', 150, 18000, false,
   'Fios em formato de Y que trazem preenchimento com leveza.', true, 2, 18, null),
  ('Volume russo', 'aplicacao', 180, 22000, true,
   'Leques feitos à mão para um olhar marcante e sofisticado.', true, 3, 18, null),
  ('Manutenção', 'manutencao', 90, 11000, true,
   'Reposição dos fios que caíram naturalmente.', false, 1, 18, 'Válida até 21 dias após a última aplicação.'),
  ('Remoção segura', 'remocao', 30, 5000, false,
   'Retirada com removedor próprio, sem danificar os fios naturais.', false, 1, null, null);
