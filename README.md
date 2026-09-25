# Resenha

Site em React para organizar jogos com amigos, controlar a partida e fechar a artilharia de cada mês.

## Como executar

Instale o Node.js 20.19 ou mais recente. Depois, abra esta pasta no VS Code e execute no terminal:

```bash
npm install
npm run dev
```

O navegador deve abrir automaticamente. Se não abrir, acesse o endereço mostrado no terminal, normalmente `http://localhost:5173`.

Se uma tentativa antiga deixou uma pasta `node_modules` incompleta, apague somente essa pasta e execute `npm install` novamente.

## Recursos

- cadastro de jogadores sem avaliação manual;
- nível geral automático de 1 a 5 estrelas, calculado pela média de gols/pontos por partida;
- nível do último jogo para acompanhar a evolução recente;
- confirmação de presença antes de cada partida;
- registro de presença no histórico de cada jogo;
- sorteio aleatório, equilibrado pelo desempenho ou divisão manual dos times;
- lista de jogadores com 10 nomes por página, sem recarregar o site;
- pódio dos três melhores pontuadores do último jogo;
- tempo e quantidade de titulares configuráveis;
- cronômetro regressivo, placar, autor dos gols e assistências;
- titulares, banco e substituições durante a partida;
- súmula com minuto de cada lance e correção de gol;
- histórico de partidas e artilharia separada por mês;
- salvamento automático no navegador;
- sincronização opcional com Supabase entre celulares;
- tela inicial obrigatória de login;
- contas protegidas por e-mail e senha;
- recuperação de senha por link enviado ao e-mail;
- perfil individual com nome e foto sincronizados;
- compressão automática da foto de perfil para até 350 KB;
- menu hambúrguer com as áreas esportivas do aplicativo;
- menu de conta com perfil, configurações, troca de senha e saída;
- alteração de senha com validação da senha atual e confirmação da nova;
- edição ou exclusão de jogadores, inclusive nomes existentes somente no ranking;
- edição e exclusão de partidas salvas;
- jogadores e históricos separados por usuário;
- exportação e importação de backup em JSON;
- modo claro e modo escuro com preferência salva.
- página de evolução mensal por jogador, com presenças, pontuações, assistências, média e nível de cada partida;
- modo treino com cronograma semanal, exercícios por tempo ou repetições, cronômetro e histórico de atividades concluídas.

O login depende do Supabase. Para configurar o banco e a autenticação, siga o arquivo `CONFIGURAR_SUPABASE.md`.

## Como funciona o nível

O nível geral usa a média de gols/pontos por partida salva no histórico: menos de 0,25 vale 1 estrela; de 0,25 a 0,74 vale 2; de 0,75 a 1,24 vale 3; de 1,25 a 1,99 vale 4; e 2 ou mais vale 5 estrelas. O nível de uma partida começa em 1 estrela sem pontuação e recebe uma estrela adicional por gol/ponto, até o limite de 5.

## Recuperação de senha

Na tela de entrada, informe o e-mail e clique em **Esqueci minha senha**. O Supabase enviará um link que volta para o site e abre a criação da nova senha. O endereço publicado precisa estar cadastrado em **Authentication > URL Configuration > Redirect URLs**, conforme o guia de configuração.
