# Atualizar o Resenha para a versão 1.7

## 1. Substituir os arquivos

Copie todo o conteúdo desta pasta para a raiz do repositório **Resenha**, substituindo os arquivos antigos. Não envie `node_modules` nem `.env.local` ao GitHub.

## 2. Atualizar o Supabase

No painel do Supabase, abra **SQL Editor**, copie todo o conteúdo de `supabase/schema.sql` e execute. O script mantém os dados existentes e atualiza a função pública usada pelo **Mural da Resenha**.

## 3. Testar no computador

```bash
npm install
npm run dev
```

Teste este fluxo:

1. Confirme os jogadores presentes.
2. Escolha de 2 a 6 times.
3. Inicie a partida, registre uma pontuação e clique em **Salvar partida e continuar**.
4. Confirme que a escalação permaneceu e que o placar voltou para zero.
5. Se houver time de fora, troque um dos lados completos.
6. Abra **Estatísticas** e confira a classificação da modalidade.
7. Abra **Mural da Resenha**, coloque-o no ar e teste o link em uma janela anônima.

## 4. Publicar no GitHub Pages

Depois do teste, faça commit e push. O workflow em `.github/workflows/deploy.yml` publicará o site com o endereço do repositório `/Resenha/`.

> Importante: mantenha no GitHub apenas as chaves públicas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Nunca publique `service_role`, `sb_secret_` ou `.env.local`.
