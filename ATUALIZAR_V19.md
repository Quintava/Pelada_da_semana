# Atualização para a versão 1.9

> Correção 1.9.1: ajustada a ordem de inicialização do cronograma ativo, que podia interromper o React e deixar a página branca. Também foi adicionada uma tela de recuperação para erros inesperados.

## Novas regras de avaliação

- vitória: `+0,4`;
- empate: `+0,2`;
- derrota: `-0,2`;
- gol contra: `-0,5`;
- pênalti perdido: `-0,3`.

O gol contra soma um gol ao adversário. O pênalti perdido não altera o placar. Os dois lances entram na súmula com jogador e minuto e podem ser anulados.

## Atualização obrigatória do Supabase

Esta versão adiciona dois tipos de evento ao banco. Depois de substituir os arquivos:

1. abra o projeto no Supabase;
2. acesse **SQL Editor**;
3. copie todo o conteúdo de `supabase/schema.sql`;
4. execute o script uma vez.

O script apenas atualiza a restrição dos tipos de eventos e as funções do Mural. Jogadores, partidas e demais dados existentes não são apagados.

No primeiro acesso, a versão do cálculo acumulado será atualizada automaticamente usando todo o histórico da conta.
