# Configurar o salvamento na nuvem

Esta configuração é necessária para liberar a tela de login e manter os dados de cada conta separados. Faça os passos abaixo.

## 1. Criar o projeto

1. Acesse https://supabase.com e crie uma conta.
2. Clique em **New project** e aguarde a criação.
3. No painel do projeto, abra **SQL Editor**.
4. Copie todo o conteúdo de `supabase/schema.sql`, cole no editor e clique em **Run**.

Se o projeto já estava configurado, execute o arquivo novamente depois desta atualização. Ele mantém os dados existentes e reforça a segurança removendo qualquer permissão direta do papel anônimo.

## 2. Localizar a URL do projeto

Na interface atual do Supabase, a URL pode não aparecer diretamente na tela inicial.

1. Entre no projeto correto no painel do Supabase.
2. No menu lateral esquerdo, abra **Integrations**.
3. Selecione **Data API**.
4. Procure a seção **Project URL** ou **API URL**.
5. Copie o endereço completo. Ele será parecido com:

```text
https://abcdefghijk.supabase.co
```

Esse endereço será usado no GitHub como:

```text
VITE_SUPABASE_URL
```

Também é possível identificar a URL pelo código do projeto: se o endereço do painel contém `/project/abcdefghijk`, normalmente a URL será `https://abcdefghijk.supabase.co`.

## 3. Localizar a chave pública

1. No menu lateral, abra **Settings**.
2. Entre em **API Keys**. Não procure por uma página chamada apenas **API**, pois ela não existe mais na interface atual.
3. Na seção de chaves, localize **Publishable key**.
4. Copie a chave que começa normalmente com:

```text
sb_publishable_
```

5. Essa chave será usada no GitHub como:

```text
VITE_SUPABASE_PUBLISHABLE_KEY
```

Se o projeto for antigo e não tiver uma chave `sb_publishable_`, a chave legada **anon** também funciona. Ela normalmente é uma chave longa que começa com `eyJ`.

Nunca copie a **Secret key**, a chave `service_role` ou qualquer chave que comece com `sb_secret_`. Essas chaves possuem acesso administrativo e não podem ser colocadas no site.

## 4. Configurar os endereços de login e recuperação de senha

1. No Supabase, abra **Authentication > URL Configuration**.
2. Em **Site URL**, informe `https://quintava.github.io/Pelada_da_semana/`.
3. Em **Redirect URLs**, adicione também `https://quintava.github.io/Pelada_da_semana/`. Esse endereço é usado tanto na confirmação do cadastro quanto no botão **Esqueci minha senha**.
4. Para testar no computador, adicione `http://localhost:5173/Pelada_da_semana/` nas URLs permitidas.

## 5. Testar no computador

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

## 6. Configurar no GitHub Pages

No repositório do GitHub, acesse **Settings > Secrets and variables > Actions** e crie dois **Repository secrets**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Depois faça um novo commit ou execute novamente o workflow em **Actions**.

## 7. Contas e dados separados

O aplicativo só abre depois do login. Cada conta possui jogadores, partidas e artilharia próprios. Para acessar o mesmo grupo em outro celular, entre com a mesma conta. Cada alteração também fica salva localmente de forma separada por usuário e é sincronizada automaticamente quando houver internet.
