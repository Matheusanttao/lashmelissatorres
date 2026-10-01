-- =====================================================================
-- Valores iniciais (seguros para rodar mais de uma vez)
-- =====================================================================

insert into public.site_content (id) values (1) on conflict (id) do nothing;

insert into public.booking_settings (id, msg_confirm, msg_reminder, msg_maintenance)
values (
  1,
  'Oi, {nome}! Aqui é do {estudio}. Seu horário de {servico} está confirmado para {data} às {hora}. Qualquer imprevisto, é só me avisar por aqui. Até lá!',
  'Oi, {nome}! Passando para lembrar do seu horário de {servico} em {data} às {hora}. Venha sem maquiagem nos olhos, combinado? Te espero com carinho.',
  'Oi, {nome}! Já está chegando a hora da manutenção dos seus cílios ({servico}). Quer que eu reserve um horário para você?'
)
on conflict (id) do nothing;

-- Expediente inicial: terça a sábado, 9h às 18h. Domingo e segunda: folga.
insert into public.working_hours (weekday, is_working, start_time, end_time) values
  (0, false, '09:00', '18:00'),
  (1, false, '09:00', '18:00'),
  (2, true,  '09:00', '18:00'),
  (3, true,  '09:00', '18:00'),
  (4, true,  '09:00', '18:00'),
  (5, true,  '09:00', '18:00'),
  (6, true,  '09:00', '15:00')
on conflict (weekday) do nothing;

-- Pausa para almoço (terça a sexta).
insert into public.working_breaks (weekday, start_time, end_time, label)
select d, '12:00', '13:00', 'Almoço'
from generate_series(2, 5) as d
where not exists (select 1 from public.working_breaks);

-- Categorias iniciais da galeria (podem ser editadas ou removidas).
insert into public.gallery_categories (name, sort_order)
select v.name, v.ord
from (values ('Fio a fio', 1), ('Volume brasileiro', 2), ('Volume russo', 3), ('Efeito molhado', 4)) as v(name, ord)
where not exists (select 1 from public.gallery_categories);
