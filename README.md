# Studio de Cílios — site e painel

Sistema completo para um estúdio de extensão de cílios: site público com agendamento online e painel
administrativo privado. Feito com **React + TypeScript (Vite)**, **Supabase** (banco, login e imagens) e
publicado na **Vercel**.

- Site público: início, serviços e preços, galeria (com antes e depois), cuidados/FAQ/políticas e
  agendamento online em 4 etapas com comprovante.
- Painel: visão geral, agenda (dia/semana/mês), clientes (histórico, preferências, fotos privadas,
  autorização de imagem), lembretes e sugestões de manutenção, serviços, galeria, conteúdo do site
  (rascunho → pré-visualização → publicação) e horários.
- Tudo em português, fuso **America/Sao_Paulo**, datas `dd/mm/aaaa` e valores em reais.

Enquanto o nome do estúdio não for publicado pelo painel, o site mostra **conteúdo de demonstração**, com
aviso visível no topo. Serviços e galeria de exemplo também aparecem marcados como "Exemplo".

---

## 1. Criar o projeto no Supabase

1. Crie um projeto em <https://supabase.com> (região São Paulo, `sa-east-1`, é a mais próxima).
2. *Authentication → Users → Add user → Create new user*: informe e-mail e senha e marque
   **Auto Confirm User**.
3. Abra *SQL Editor → New query*, abra o arquivo `supabase/setup-completo.sql`, **troque o e-mail**
   na seção `ADMIN` no final do arquivo e execute tudo de uma vez.
4. (Opcional) Rode `supabase/seed-exemplo.sql` para já ter alguns serviços cadastrados.
5. Recomendado: *Authentication → Sign In / Providers → Email* → desative **Allow new users to sign up**.

As migrations individuais em `supabase/migrations/` continuam disponíveis (e o `npm run test:db` as usa).
O script único já inclui a inserção na tabela `admins`.

Para remover um acesso: `delete from public.admins where user_id = '...';`

## 2. Configurar o Cloudinary (fotos)

As imagens do site, galeria, serviços e clientes vão para o **Cloudinary** (não usam o Storage do Supabase
no frontend).

1. Crie uma conta em <https://cloudinary.com>.
2. Anote o **Cloud name** em *Settings → Product environment credentials*.
3. Em *Settings → Upload → Upload presets*, crie um preset **Unsigned** (ex.: `lash_unsigned`).
4. Coloque cloud name e preset no `.env.local` (veja a seção de variáveis abaixo).

Apagar uma foto no painel remove a referência no banco; arquivos órfãos podem ser limpos no painel do
Cloudinary (a API de exclusão precisa de chave secreta, que não fica no navegador).

## 3. Configurar a recuperação de senha (Supabase)

Em *Authentication → URL Configuration*:

- **Site URL:** o endereço do site (ex.: `https://seuestudio.com.br` ou `https://seu-projeto.vercel.app`).
- **Redirect URLs:** adicione `https://SEU-DOMINIO/admin/nova-senha` e, para testes locais,
  `http://localhost:5173/admin/nova-senha`.

Se quiser, traduza o modelo do e-mail em *Authentication → Emails → Reset Password*.

## 4. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-publica
VITE_CLOUDINARY_CLOUD_NAME=seu-cloud-name
VITE_CLOUDINARY_UPLOAD_PRESET=seu-upload-preset-unsigned
```

Use **apenas a chave `anon` (pública)** do Supabase. Nunca coloque `service_role` nem a API secret do
Cloudinary no frontend nem na Vercel com prefixo `VITE_`: tudo que começa com `VITE_` vai para o
navegador. A segurança do banco está nas políticas de RLS; o upload de imagens usa preset **unsigned**.

## 5. Rodar localmente

```bash
npm install
```

```bash
npm run dev
```

Acesse <http://localhost:5173> (site) e <http://localhost:5173/admin> (painel).

Outros comandos:

| Comando | O que faz |
| --- | --- |
| `npm run build` | Verifica os tipos e gera a versão de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm run test:db` | Aplica as migrations num Postgres em memória e roda 46 verificações de segurança e agenda |

## 6. Publicar na Vercel

1. Envie o projeto para um repositório no GitHub.
2. Na Vercel: *Add New → Project* → importe o repositório. Ela detecta **Vite** automaticamente
   (build `npm run build`, saída `dist`).
3. Em *Settings → Environment Variables*, cadastre `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
   `VITE_CLOUDINARY_CLOUD_NAME` e `VITE_CLOUDINARY_UPLOAD_PRESET` (Production e Preview).
4. Faça o deploy. O `vercel.json` já cuida das rotas do site (atualizar a página em `/admin/agenda`
   funciona) e dos cabeçalhos de cache e segurança.
5. Volte ao passo 3 e cadastre o domínio final nas URLs de autenticação do Supabase.

Alterações feitas no painel aparecem no site sem novo deploy: o conteúdo vem do banco a cada visita.

## 7. Primeiros passos no painel

1. **Horários e agenda:** dias de trabalho, horários, pausas, intervalo entre atendimentos, antecedência
   mínima, aprovação automática ou manual e mensagens prontas.
2. **Serviços e preços:** cadastre os procedimentos (foto, duração, preço fixo ou "a partir de",
   intervalo de manutenção). Enquanto não houver serviço ativo, o agendamento online fica fechado.
3. **Conteúdo do site:** nome, frase, banner, logo, cores, apresentação, contatos, cuidados, FAQ e
   políticas. Salve o rascunho, clique em **Pré-visualizar** e depois em **Publicar no site**.
4. **Clientes → autorização de imagem:** registre antes de publicar qualquer foto na galeria.
5. **Galeria:** envie as fotos, vincule a autorização, escolha a técnica e publique.

---

## Como a segurança funciona

| Regra | Onde é garantida |
| --- | --- |
| Visitantes só veem conteúdo publicado, serviços ativos, galeria publicada e horários livres | RLS + funções `get_site_content`, `get_public_gallery`, `get_available_slots/days` |
| Visitantes não leem clientes, agendamentos, bloqueios nem rascunhos | Sem permissão de tabela para `anon` (retorna "permission denied") |
| Solicitação de agendamento pública | Função `request_booking`: valida dados, serviço ativo, horário realmente livre, limita tentativas por IP e WhatsApp e limita pedidos pendentes por número |
| Nenhum horário sobreposto, nem com duas reservas ao mesmo tempo | Lock transacional da agenda + restrição `EXCLUDE` no banco (considera duração + intervalo) |
| Bloqueios e folgas | Gatilho impede atendimento em período bloqueado e bloqueio sobre atendimento ativo |
| Só administradoras acessam o painel | Tabela `admins` sem política de escrita; `is_admin()` em todas as políticas; o painel também verifica e desconecta contas sem permissão |
| Galeria só com autorização de imagem | Gatilho impede publicar sem autorização ativa; revogar a autorização tira as fotos do site na hora |
| Dados pessoais fora da galeria | A função pública não devolve cliente nem autorização |
| Imagens | Upload via Cloudinary (preset unsigned); galeria pública só com autorização ativa no banco |

Observações:

- **WhatsApp:** o sistema abre o WhatsApp com a mensagem pronta; o envio é sempre manual. Nada é
  apresentado como "enviado automaticamente". Se no futuro houver envio automático, será preciso
  configurar um provedor (ex.: API oficial do WhatsApp Business) e registrar o resultado de cada envio.
- **Comprovante:** o link `/agendamento/CÓDIGO` mostra só primeiro nome, serviço, data e valor.
- **Tempo real:** novas solicitações feitas pelo site aparecem no painel sem recarregar (Supabase Realtime).

## Estrutura

```
supabase/
  setup-completo.sql script único para o SQL Editor (migrations + admin)
  migrations/        estrutura, funções, RLS, storage e valores iniciais
  tests/             testes do banco (npm run test:db)
  seed-exemplo.sql   serviços de exemplo (opcional)
src/
  lib/               formatação, conteúdo padrão, Cloudinary, WhatsApp, erros
  hooks/             autenticação, conteúdo do site, dados públicos
  components/ui/     botões, campos, modais, avisos, estados vazios, envio de imagens, marca
  public/            layout e páginas do site
  admin/             layout, rotas protegidas, formulários e páginas do painel
  styles/            identidade visual (tokens), componentes, site e painel
```

## Personalização visual

As cores de destaque e de fundo são escolhidas no painel (*Conteúdo do site → Marca e banner*). Se a cor
escolhida deixar os botões com pouco contraste, ela é escurecida automaticamente. Os demais tokens
(tipografia, raios, sombras) ficam em `src/styles/base.css`.
