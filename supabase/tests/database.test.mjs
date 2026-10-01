// Testes do banco: aplica o script único num Postgres em memória (PGlite)
// e valida conflitos de agenda, RLS, galeria/autorizações e publicação.
// Rode com: npm run test:db
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SETUP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'setup-completo.sql');
const db = new PGlite();
// Simula o que o Supabase já fornece: papéis, auth.uid() e o schema de storage.
const stub = `
create role anon nologin; create role authenticated nologin;
create schema auth; create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
create schema storage; create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
`;
await db.exec(stub);
const sql = fs.readFileSync(SETUP, 'utf8');
try { await db.exec(sql); console.log('OK setup-completo.sql'); }
catch (e) { console.log('FAIL setup-completo.sql', e.message); process.exit(1); }
try { await db.exec(sql); } catch (e) { console.log('FAIL rerun', e.message); process.exit(1); }
console.log('rerun ok');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  OK ', m); } else { fail++; console.log('  FALHA', m); } };
async function as(role, uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function err(p) { try { await p; return null; } catch (e) { return e.message; } }
const ADMIN = '11111111-1111-1111-1111-111111111111', USER = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${ADMIN}','a@x'),('${USER}','u@x'); insert into admins(user_id) values ('${ADMIN}');`);
const svc = (await db.query(`insert into services(name,type,duration_minutes,price_cents) values ('Volume Brasileiro','aplicacao',120,18000) returning id`)).rows[0].id;
await db.exec(`update booking_settings set buffer_minutes=15, slot_step_minutes=30, min_advance_hours=0`);
const day = (await db.query(`select to_char(((now() at time zone 'America/Sao_Paulo')::date + ((9 - extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::int) % 7) + 7), 'YYYY-MM-DD') as d`)).rows[0].d;
console.log('Test day', day);
const hm = (r) => r.starts_at.toISOString().slice(11, 16);

console.log('Visitante (anon):');
ok(await err(as('anon', null, () => db.query('select * from clients'))), 'não lê clientes');
ok(await err(as('anon', null, () => db.query('select * from appointments'))), 'não lê agendamentos');
ok(await err(as('anon', null, () => db.query('select * from gallery_items'))), 'não lê tabela da galeria direto');
ok(await err(as('anon', null, () => db.query('select * from site_content'))), 'não lê rascunho do conteúdo');
ok(await err(as('anon', null, () => db.query('select * from time_blocks'))), 'não lê bloqueios');
ok(await err(as('anon', null, () => db.query(`insert into appointments(client_id, service_name, duration_minutes, starts_at, ends_at, occupied_until, code) values (gen_random_uuid(),'x',60,now(),now(),now(),'X')`))), 'não insere agendamento direto');
ok(await err(as('anon', null, () => db.query(`select * from admin_available_slots('${svc}', '${day}')`))), 'não usa função do painel');
ok(await err(as('anon', null, () => db.query(`select * from compute_slots('${svc}', '${day}', true)`))), 'não chama cálculo interno');
const slots = await as('anon', null, () => db.query(`select * from get_available_slots('${svc}', '${day}')`));
console.log('   slots:', slots.rows.map(hm).join(' '));
ok(slots.rows.length > 0, 'vê horários disponíveis');
const first = `${day}T12:00:00Z`;
const r1 = await as('anon', null, () => db.query(`select request_booking('${svc}', '${first}', 'Maria Clara Souza', '(11) 98888-7777', 'maria@ex.com', null) as r`));
ok(r1.rows[0].r.status === 'pendente', 'solicitação criada como pendente: ' + r1.rows[0].r.code);
ok(!('whatsapp' in r1.rows[0].r), 'comprovante não traz telefone');
ok(await err(as('anon', null, () => db.query(`select request_booking('${svc}', '${first}', 'Joana', '11977776666')`))), 'mesmo horário é recusado');
const e2 = await err(as('anon', null, () => db.query(`select request_booking('${svc}', '${day}T13:30:00Z', 'Joana', '11977776666')`)));
ok(e2, 'horário sobreposto recusado: ' + e2);
const slots2 = await as('anon', null, () => db.query(`select * from get_available_slots('${svc}', '${day}')`));
console.log('   slots depois:', slots2.rows.map(hm).join(' '));
ok(!slots2.rows.some(r => r.starts_at.toISOString() === new Date(first).toISOString()), 'horário ocupado sumiu da lista');
ok(await err(as('anon', null, () => db.query(`select request_booking('${svc}', '${day}T12:10:00Z', 'Joana', '11977776666')`))), 'horário fora da grade recusado');
ok(await err(as('anon', null, () => db.query(`select request_booking('${svc}', '${day}T16:00:00Z', 'J', '123')`))), 'dados inválidos recusados');
const rec = await as('anon', null, () => db.query(`select get_booking_receipt('${r1.rows[0].r.code}') as r`));
ok(rec.rows[0].r.client_first_name === 'Maria', 'comprovante pelo código');
const days = await as('anon', null, () => db.query(`select * from get_available_days('${svc}', '${day}', ('${day}'::date + 6))`));
ok(days.rows.length >= 4, 'dias disponíveis: ' + days.rows.length);
await as('anon', null, () => db.query(`select request_booking('${svc}', '${day}T16:00:00Z', 'Maria Clara', '11988887777')`));
ok(await err(as('anon', null, () => db.query(`select request_booking('${svc}', '${day}T18:30:00Z', 'Maria Clara', '11988887777')`))), 'limite de pendentes por WhatsApp');

console.log('Conta comum (não admin):');
ok((await as('authenticated', USER, () => db.query('select * from clients'))).rows.length === 0, 'não vê clientes');
ok(await err(as('authenticated', USER, () => db.query(`insert into admins(user_id) values ('${USER}')`))), 'não se torna admin');
ok((await as('authenticated', USER, () => db.query('select is_admin() a'))).rows[0].a === false, 'is_admin = false');
ok(await err(as('authenticated', USER, () => db.query(`select publish_site_content()`))), 'não publica conteúdo');
const upd = await as('authenticated', USER, () => db.query(`update appointments set status='cancelado' returning id`));
ok(upd.rows.length === 0, 'não altera agendamentos');

console.log('Administradora:');
ok((await as('authenticated', ADMIN, () => db.query('select * from clients'))).rows.length === 1, 'vê clientes');
const cl = (await as('authenticated', ADMIN, () => db.query(`insert into clients(name, whatsapp) values ('Ana Paula','+55 (21) 99999-0000') returning id, whatsapp`))).rows[0];
ok(cl.whatsapp === '21999990000', 'telefone normalizado');
const e3 = await err(as('authenticated', ADMIN, () => db.query(`insert into appointments(client_id, service_id, starts_at) values ('${cl.id}','${svc}','${day}T13:00:00Z')`)));
ok(e3, 'admin também não sobrepõe: ' + e3);
const ap = (await as('authenticated', ADMIN, () => db.query(`insert into appointments(client_id, service_id, starts_at, status) values ('${cl.id}','${svc}','${day}T19:00:00Z','confirmado') returning *`))).rows[0];
ok(ap.service_name === 'Volume Brasileiro' && ap.price_cents === 18000 && ap.duration_minutes === 120 && ap.buffer_minutes === 15, 'dados do serviço copiados');
ok(await err(as('authenticated', ADMIN, () => db.query(`insert into time_blocks(starts_at, ends_at) values ('${day}T19:30:00Z','${day}T20:00:00Z')`))), 'bloqueio sobre atendimento recusado');
await as('authenticated', ADMIN, () => db.query(`insert into time_blocks(starts_at, ends_at, kind) values (('${day}'::date + 1 + time '00:00') at time zone 'America/Sao_Paulo', ('${day}'::date + 2 + time '00:00') at time zone 'America/Sao_Paulo', 'folga')`));
const s3 = await as('anon', null, () => db.query(`select * from get_available_slots('${svc}', ('${day}'::date + 1))`));
ok(s3.rows.length === 0, 'folga sem horários');
ok(await err(as('authenticated', ADMIN, () => db.query(`insert into appointments(client_id, service_id, starts_at) values ('${cl.id}','${svc}', (('${day}'::date + 1 + time '10:00') at time zone 'America/Sao_Paulo'))`))), 'atendimento em folga recusado');
await as('authenticated', ADMIN, () => db.query(`update appointments set status='cancelado' where id='${ap.id}'`));
ok((await as('authenticated', ADMIN, () => db.query(`insert into appointments(client_id, service_id, starts_at) values ('${cl.id}','${svc}','${day}T19:30:00Z') returning id`))).rows.length === 1, 'cancelado libera horário');
const ex = (await db.query(`select id from appointments where starts_at='${first}'`)).rows[0].id;
const rs = await as('authenticated', ADMIN, () => db.query(`select * from admin_available_slots('${svc}', '${day}', '${ex}', null)`));
ok(rs.rows.some(r => r.starts_at.toISOString() === new Date(first).toISOString()), 'reagendar considera o próprio horário livre');
await db.exec('alter table appointments disable trigger appointments_validate');
const e5 = await err(db.query(`insert into appointments(code, client_id, service_name, service_type, price_cents, buffer_minutes, duration_minutes, starts_at, ends_at, occupied_until, status) values ('ZZZZZZZZZZ','${cl.id}','x','aplicacao',0,15,60,'${day}T12:30:00Z','${day}T13:30:00Z','${day}T13:45:00Z','confirmado')`));
ok(e5 && e5.includes('appointments_no_overlap'), 'constraint do banco impede sobreposição mesmo sem gatilho');
await db.exec('alter table appointments enable trigger appointments_validate');

console.log('Galeria:');
ok(await err(as('authenticated', ADMIN, () => db.query(`insert into gallery_items(image_url, published) values ('http://x/a.jpg', true)`))), 'publicar sem autorização recusado');
const cons = (await as('authenticated', ADMIN, () => db.query(`insert into image_consents(client_id) values ('${cl.id}') returning id`))).rows[0].id;
const g = (await as('authenticated', ADMIN, () => db.query(`insert into gallery_items(image_url, published, consent_id) values ('http://x/a.jpg', true, '${cons}') returning client_id`))).rows[0];
ok(g.client_id === cl.id, 'foto vinculada à cliente');
const pg = await as('anon', null, () => db.query(`select * from get_public_gallery()`));
ok(pg.rows.length === 1 && !('client_id' in pg.rows[0]) && !('consent_id' in pg.rows[0]), 'galeria pública sem dados pessoais');
await as('authenticated', ADMIN, () => db.query(`update image_consents set revoked_at=now() where id='${cons}'`));
ok((await as('anon', null, () => db.query(`select * from get_public_gallery()`))).rows.length === 0, 'revogar autorização tira do site');

console.log('Conteúdo:');
await as('authenticated', ADMIN, () => db.query(`update site_content set draft='{"studioName":"Ateliê Teste"}'`));
ok((await as('anon', null, () => db.query(`select get_site_content() c`))).rows[0].c.content.studioName === undefined, 'rascunho não aparece antes de publicar');
await as('authenticated', ADMIN, () => db.query(`select publish_site_content()`));
ok((await as('anon', null, () => db.query(`select get_site_content() c`))).rows[0].c.content.studioName === 'Ateliê Teste', 'publicado aparece');
ok((await as('anon', null, () => db.query('select * from services'))).rows.length >= 1, 'visitante lê serviços ativos');
await db.exec(`update services set active=false`);
ok((await as('anon', null, () => db.query('select * from services'))).rows.length === 0, 'serviço inativo oculto');
ok(await err(as('anon', null, () => db.query(`select request_booking('${svc}', '${day}T20:00:00Z', 'Bia Lima', '11955554444')`))), 'serviço inativo não agenda');
await db.exec(`update services set active=true`);

console.log('Manutenção:');
await db.exec(`update services set maintenance_interval_days=20; insert into appointments(client_id, service_id, starts_at, status) values ('${cl.id}','${svc}', now() - interval '18 days', 'concluido');`);
ok((await as('authenticated', ADMIN, () => db.query(`select * from get_maintenance_suggestions(7)`))).rows.length === 0, 'cliente com agendamento futuro não recebe sugestão');
await db.exec(`update appointments set status='cancelado' where client_id='${cl.id}' and starts_at > now()`);
const ms2 = await as('authenticated', ADMIN, () => db.query(`select * from get_maintenance_suggestions(7)`));
ok(ms2.rows.length === 1 && ms2.rows[0].days_until === 2, 'sugere manutenção: ' + JSON.stringify(ms2.rows[0]?.days_until));
ok((await as('anon', null, () => err(db.query(`select * from get_maintenance_suggestions(7)`)))), 'visitante não vê sugestões');

console.log(`\n${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
