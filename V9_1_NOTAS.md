# AcadeConnect / Mustangs Atlética — V9.1

## Objetivo
Reduzir requisições HTTP redundantes do frontend sem alterar layout ou regras de negócio.

## Alterações
- `frontend/src/api/realtime.js`
  - mantém um único SSE por aba;
  - expõe estado de conexão (`subscribeRealtimeStatus` / `isRealtimeConnected`);
  - informa os consumidores quando o SSE cai ou reconecta.
- `frontend/src/hooks/useLiveConversation.js`
  - polling incremental agora roda somente quando SSE está indisponível;
  - com SSE conectado, não há polling periódico da conversa;
  - fallback continua adaptativo de 5s até 60s;
  - polling pausa com aba oculta;
  - evita sobreposição de fallback.
- `frontend/src/layouts/DashboardLayout.jsx`
  - remove polling periódico enquanto SSE está saudável;
  - fallback de 120s somente se SSE estiver indisponível;
  - eventos SSE são agrupados por 250ms;
  - `message` não dispara segunda consulta de unread quando já existe evento de notificação.
- `frontend/src/components/Header.jsx`
  - `message` não dispara nova consulta de notificações;
  - eventos de notificação são agrupados por 200ms;
  - foco da aba só faz verificação se a última consulta tiver mais de 30s.

## Preservado
PIX, QR de presença, inscrições, certificados, loja, pedidos, sorteios, mensagens e layout não foram alterados por esta otimização.

## Segurança de banco
Nenhuma migration nova foi criada. Não há reset, DROP, TRUNCATE ou DELETE.

## Validação
- `node --check` passou nos arquivos JS modificados que não contêm JSX.
- O build Vite não foi executado neste ambiente porque o ZIP não contém `node_modules` e a instalação offline não tinha todos os pacotes em cache.
- Rode `npm install` e `npm run build` no ambiente do projeto antes do deploy.
