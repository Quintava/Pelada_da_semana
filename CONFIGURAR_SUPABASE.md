# Configurar o salvamento na nuvem

Sem esta configuração, o site continua funcionando e salvando no navegador. Para sincronizar entre celulares, faça os passos abaixo.

## 1. Criar o projeto

1. Acesse https://supabase.com e crie uma conta.
2. Clique em **New project** e aguarde a criação.
3. No painel do projeto, abra **SQL Editor**.
4. Copie todo o conteúdo de `supabase/schema.sql`, cole no editor e clique em **Run**.

## 2. Obter as informações públicas

1. No Supabase, abra o painel **Connect** do projeto.
2. Copie a **Project URL**.
3. Copie a **Publishable key**. Em projetos antigos, ela pode aparecer como chave `anon`.
4. Nunca use nem publique a chave `service_role`.

## 3. Configurar o endereço de login

1. No Supabase, abra **Authentication > URL Configuration**.
2. Em **Site URL**, informe `https://quintava.github.io/Pelada_da_semana/`.
3. Em **Redirect URLs**, adicione também `https://quintava.github.io/Pelada_da_semana/`.
4. Para testar no computador, adicione `http://localhost:5173/Pelada_da_semana/` nas URLs permitidas.

## 4. Testar no computador

Crie um arquivo chamado `.env.local` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
```

Depois execute:

```bash
npm install
npm run dev
```

## 5. Configurar no GitHub Pages

No repositório do GitHub, acesse **Settings > Secrets and variables > Actions** e crie dois **Repository secrets**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Depois faça um novo commit ou execute novamente o workflow em **Actions**.

## 6. Contas e dados separados

O aplicativo só abre depois do login. Cada conta possui jogadores, partidas e artilharia próprios. Para acessar o mesmo grupo em outro celular, entre com a mesma conta. Cada alteração também fica salva localmente de forma separada por usuário e é sincronizada automaticamente quando houver internet.
