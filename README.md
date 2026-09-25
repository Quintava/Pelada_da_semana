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
- súmula com minuto de cada lance e botão visível para anular uma pontuação lançada por engano;
- histórico de partidas e artilharia separada por mês;
- salvamento automático no navegador;
- sincronização com Supabase entre celulares, organizada dentro das configurações;
- tela inicial obrigatória de login;
- contas protegidas por e-mail e senha;
- recuperação de senha por link enviado ao e-mail;
- perfil individual com nome e inicial gerada automaticamente;
- menu hambúrguer com as áreas esportivas do aplicativo;
- menu de conta com perfil, configurações, troca de senha e saída;
- alteração de senha com validação da senha atual e confirmação da nova;
- edição ou exclusão de jogadores somente nas configurações, com confirmação antes de apagar;
- edição e exclusão de partidas salvas;
- jogadores e históricos separados por usuário;
- exportação e importação de backup em JSON;
- modo claro e modo escuro com preferência salva.
- página de evolução mensal por jogador, com presenças, pontuações, assistências, média e nível de cada partida;
- página de evolução mensal redesenhada, com seleção destacada de atleta e período;
- Futebol, Futebol Society e Futebol de Salão com rankings geral, de assistências e de gols;
- Vôlei com ranking exclusivo de pontos e Basquete com ranking de cestas;
- configuração automática de jogadores e tempo ao selecionar cada modalidade, mantendo os campos editáveis;
- modo treino com cronograma semanal, exercícios por tempo ou repetições e histórico de atividades concluídas;
- exercícios cronometrados em segundos, minutos ou horas;
- checklist e cronômetro independente para cada exercício;
- página de estatísticas de treino com frequência, volume, tempo e repetições.
- grupos compartilhados com convite por link ou código;
- permissões de administrador, mesário e somente visualização;
- confirmação de presença por link público e importação para a escalação;
- página pública opcional com ranking e resultados;
- compartilhamento do resultado como imagem;
- conquistas automáticas da rodada e lembrete local;
- instalação como PWA no celular, com cache básico para abertura mais rápida;
- sincronização incremental em tabelas separadas, evitando reenviar todo o histórico a cada alteração.

O login depende do Supabase. Para configurar o banco e a autenticação, siga o arquivo `CONFIGURAR_SUPABASE.md`.

## Segurança

- o site usa apenas a chave pública do Supabase no navegador;
- todas as tabelas possuem RLS; jogadores, partidas e configurações obedecem às permissões do grupo;
- o papel anônimo não recebe acesso à tabela do aplicativo;
- nenhuma chave `service_role` ou `sb_secret_` deve ser colocada no GitHub;
- backups importados são validados, possuem limite de 2 MB e exigem confirmação;
- o HTML inclui uma política de conteúdo que bloqueia scripts e conexões fora das origens permitidas.

Ao atualizar uma instalação existente, execute novamente todo o conteúdo de `supabase/schema.sql` no SQL Editor. A versão atual cria as tabelas normalizadas, grupos e permissões sem apagar a antiga `app_state`; no primeiro acesso, os dados legados são migrados automaticamente para o grupo padrão.

## Publicação após renomear o repositório

O projeto está configurado para o repositório `resenha`, portanto o endereço esperado é `https://quintava.github.io/resenha/`. Em **Settings > Pages**, deixe **Source: GitHub Actions**. No Supabase, atualize **Authentication > URL Configuration** para o novo endereço e remova a URL antiga apenas depois de confirmar que o login e a recuperação de senha funcionam.

## Sugestões automáticas por esporte

Ao selecionar uma modalidade, o aplicativo preenche automaticamente a quantidade de jogadores em jogo e a duração sugerida: Futebol (11 e 20 minutos), Futebol Society (5 e 10 minutos), Futebol de Salão (5 e 10 minutos), Vôlei (2 e 15 minutos), Basquete (5 e 10 minutos) e Handebol (7 e 20 minutos). Esses dois campos continuam editáveis.

## Como funciona o nível

O nível geral usa a média de gols/pontos por partida salva no histórico: menos de 0,25 vale 1 estrela; de 0,25 a 0,74 vale 2; de 0,75 a 1,24 vale 3; de 1,25 a 1,99 vale 4; e 2 ou mais vale 5 estrelas. O nível de uma partida começa em 1 estrela sem pontuação e recebe uma estrela adicional por gol/ponto, até o limite de 5.

## Recuperação de senha

Na tela de entrada, informe o e-mail e clique em **Esqueci minha senha**. O Supabase enviará um link que volta para o site e abre a criação da nova senha. O endereço publicado precisa estar cadastrado em **Authentication > URL Configuration > Redirect URLs**, conforme o guia de configuração.
