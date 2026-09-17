# Pelada da Semana

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

- cadastro de jogadores com nível de 1 a 5;
- sorteio aleatório ou equilibrado de dois times;
- tempo e quantidade de titulares configuráveis;
- cronômetro regressivo, placar e autor dos gols;
- titulares, banco e substituições durante a partida;
- súmula com minuto de cada lance e correção de gol;
- histórico de partidas e artilharia separada por mês;
- salvamento automático no navegador.

Os dados ficam no `localStorage`. Ao limpar os dados do navegador, o histórico também é apagado.
