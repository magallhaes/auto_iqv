# QuantIQ — Terminal Algorítmico & Catalogador Probabilístico para IQ Option

Uma plataforma de execução automatizada e catalogação estatística em tempo real conectada diretamente à infraestrutura WebSocket da IQ Option, combinando estratégias probabilísticas (família MHI) com confluência de indicadores técnicos (EMA 9/21, RSI, Bandas de Bollinger, MACD, Suporte/Resistência e Price Action) e gestão avançada de risco (Martingale, Soros e SorosGale).

### Revisão do Usuário & Decisões Confirmadas

> [!IMPORTANT]
> As escolhas abaixo foram confirmadas e governam toda a arquitetura do sistema. Como a corretora IQ Option utiliza cabeçalhos e cookies restritos a origens autorizadas (CORS), o servidor backend atuará como ponte direta e dedicada para autenticação (`auth.iqoption.com/api/v2/login` ou token `SSID`) e túnel WebSocket em tempo real (`wss://iqoption.com/echo/websocket`).

- **Conexão e Execução Direta via API/WebSocket**: Autenticação via credenciais (E-mail/Senha, suporte a 2FA ou inserção direta de token `SSID`) através de túnel WebSocket dedicado no servidor para recebimento de candles reais e disparo de ordens binárias e digitais.
- **Confluência Completa de Estratégias e Indicadores**: Motor de sinais unificando variações MHI (MHI 1, MHI 2, MHI 3, Maioria e Minoria), cruzamento e tendência de EMA 9 e EMA 21, RSI, Bandas de Bollinger, MACD, zonas de Suporte/Resistência automáticas, gatilhos de Price Action (Engolfo e Pinbar) e Filtro de Notícias Econômicas (bloqueio automático em eventos de 2 e 3 touros).
- **Gerenciamento Avançado de Banca e Contas**: Alternância instantânea entre Conta Treinamento (Demo / `PRACTICE`) e Conta Real (`REAL`), proteção rígida de Stop Win e Stop Loss diários, Martingale configurável (Gale 1 e Gale 2), Soros em níveis e SorosGale automatizado.

---

### 1. Visão Geral & Conceito Central

- **O Que o Aplicativo Faz**: Conecta-se à conta IQ Option do trader, processa o fluxo ao vivo de candles (M1, M5 e M15) de múltiplos pares de moedas (abertos e OTC), calcula em tempo real a taxa de assertividade histórica de cada par na página de **Catalogação**, e opera automaticamente quando os critérios de confluência entre MHI e indicadores técnicos são atingidos.
- **Público-Alvo**: Traders de opções binárias e digitais que buscam precisão estatística e disciplina operacional sem interferência emocional, exigindo validação prévia da assertividade de cada ativo antes de ligar o robô.
- **Valor Principal**: Elimina entradas cegas em pares com baixa assertividade momentânea ao vincular diretamente o **Catalogador de Assertividade por Par** ao **Robô Operador**, permitindo ativar a operação automática apenas nos ativos que superam a meta de vitória configurada (ex: >85% com até 1 Gale).

---

### 2. Experiência do Usuário & Design Visual

- **Fluxos Principais do Usuário**:
  1. **Conexão & Sincronização de Conta**: Na barra superior ou modal de autenticação, o usuário insere suas credenciais da IQ Option (ou `SSID` de sessão). O sistema autentica, sincroniza os saldos de Conta Real e Conta Demo, e inicia a assinatura de candles em tempo real via WebSocket.
  2. **Terminal de Operação & Confluência (Visão Principal)**: O usuário visualiza o gráfico interativo de velas com EMA 9, EMA 21, Bandas de Bollinger e linhas de Suporte/Resistência plotadas ao vivo, ao lado do painel de parametrização da estratégia, status do quadrante MHI atual, filtro de notícias e histórico de ordens executadas.
  3. **Página de Catalogação de Assertividade por Par**: Uma matriz analítica de alta densidade que escaneia dezenas de pares (EUR/USD, GBP/USD, AUD/CAD, EUR/JPY, USD/BRL OTC, etc.), exibindo a porcentagem exata de **Win de Primeira**, **Win no Gale 1**, **Win no Gale 2** e **Loss (Hit)** nas últimas $N$ horas/quadrantes para cada variação da estratégia. Com um clique em *"Operar Este Par"*, o ativo é enviado diretamente para a fila ativa do robô.
  4. **Gestão de Risco & Calendário Econômico**: Configuração precisa de valor de entrada, fator multiplicador de Martingale, níveis de Soros/SorosGale, metas de Stop Win/Loss e visualização da agenda econômica com pausa automática antes e depois de notícias de alto impacto.

- **Identidade Visual & Tema**:
  - *Direção Estética*: Terminal Financeiro Institucional de Alta Precisão (inspirado em plataformas quantitativas de mesa proprietária). Superfícies planas com bordas sutis de `1px`, foco absoluto na legibilidade numérica e zero poluição visual.
  - *Paleta de Cores & Atmosfera*:
    - `--background`: Ardósia Profunda (`#0B0F17`) como tela dominante (60%).
    - `--surface`: Cinza Grafite Técnico (`#111827`) com bordas de linha fina (`#1E293B`) para painéis e grades (30%).
    - `--primary` / `--accent`: Azul Cobalto Institucional (`#2563EB`) para controles primários e estados ativos (10%).
    - *Semântica de Mercado*: Verde Esmeralda (`#10B981`) para sinais `CALL` / `WIN`, Vermelho Carmesim (`#EF4444`) para sinais `PUT` / `LOSS`, e Âmbar (`#F59E0B`) para recuperação em `GALE` ou alerta de notícia econômica.
  - *Tipografia & Hierarquia*:
    - *Display & Navegação*: `Plus Jakarta Sans` (pesos 600 e 700) para cabeçalhos e estrutura de navegação limpa.
    - *Corpo & Controles*: `DM Sans` (13px–15px) para rótulos de formulários e parâmetros de estratégia.
    - *Dados, Preços, Cronômetros e Assertividade*: `JetBrains Mono` com `tabular-nums` obrigatório em todas as cotações, contagens regressivas de vela, taxas percentuais de catalogação e resultados financeiros.
  - *Layout & Estrutura Espacial*:
    - Barra de navegação superior seguindo o contrato de 3 zonas: Marca à esquerda, navegação limpa no centro (`Terminal Operador`, `Catalogação de Pares`, `Gestão & SorosGale`, `Filtro de Notícias`) e botão primário de conexão/status da conta à direita.
    - Grade de alta densidade com linhas de `40px` nas tabelas de catalogação e histórico de ordens, garantindo alinhamento vertical perfeito de casas decimais.

- **Feedback Interativo & Movimento**:
  - Cronômetro regressivo de fechamento de vela e início de quadrante MHI sincronizado ao segundo com o horário do servidor da IQ Option.
  - Indicadores claros de confluência (ex: leitura textual direta indicando se EMA 9 > EMA 21, valor atual do RSI e posição nas Bandas de Bollinger) antes do disparo da ordem.
  - Notificações instantâneas de execução de ordem, entrada em Gale 1/2 e atingimento de Stop Win ou Stop Loss.

---

### 3. Decisões de Produto & Trade-Offs

- **Decisão 1: Túnel WebSocket Server-Side para a API da IQ Option**
  - *Abordagem Escolhida*: O servidor Node.js/Express mantém a conexão cliente WebSocket direta com `wss://iqoption.com/echo/websocket` e a autenticação HTTP com `https://auth.iqoption.com/api/v2/login`, retransmitindo eventos em tempo real para o navegador via WebSocket local no mesmo domínio.
  - *Por Quê*: Navegadores bloqueiam conexões diretas para a API de autenticação e WebSocket da IQ Option devido a políticas de CORS e cookies `HttpOnly` (`ssid`). O proxy no servidor garante conexão direta real sem bloqueios de navegador.
  - *Alternativas Consideradas*: Conexão 100% no cliente (descartada pois falha por bloqueio de CORS da corretora).

- **Decisão 2: Motor de Catalogação Contínua com Filtro de Confluência**
  - *Abordagem Escolhida*: O catalogador processa os blocos históricos de velas de cada par de moedas e permite recalcular instantaneamente a assertividade tanto para a estratégia **MHI Pura** quanto para **MHI + Confluência de Indicadores** (ex: catalogar apenas quadrantes a favor da tendência da EMA 9/21).
  - *Por Quê*: Permite que o usuário descubra rapidamente se adicionar o filtro de EMA 9/21 ou RSI aumenta a taxa de vitória de primeira entrada em determinado par antes de arriscar saldo.

- **Decisão 3: Máquina de Estados Determinística para Martingale, Soros e SorosGale**
  - *Abordagem Escolhida*: Gerenciamento centralizado de ciclos operacionais que calcula automaticamente o lote da próxima entrada com base no resultado oficial retornado pela corretora (`win`, `equal`, `loose`).
  - *Por Quê*: Em estratégias MHI de 1 minuto, a transição entre a vela inicial e o Gale 1 ocorre no exato fechamento do segundo `:00`. A verificação precisa no fechamento da vela garante entrada imediata no Gale sem atraso de execução.

---

### 4. Arquitetura Técnica & Estratégia de Dados

- **Diagrama de Arquitetura e Componentes**:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        INTERFACE DO USUÁRIO (REACT)                          │
│                                                                              │
│  ┌───────────────────────┐  ┌────────────────────────┐  ┌─────────────────┐  │
│  │   Barra de Navegação  │  │  Seletor Real / Demo   │  │ Modal Conexão   │  │
│  │      (3 Zonas)        │  │  & Status Stop Win/Loss│  │ IQ Option / SSID│  │
│  └───────────┬───────────┘  └───────────┬────────────┘  └────────┬────────┘  │
│              │                          │                        │           │
│  ┌───────────▼──────────────────────────▼────────────────────────▼────────┐  │
│  │                     GERENCIADOR DE ESTADO & SINAIS                     │  │
│  └───┬────────────────────┬──────────────────────────┬────────────────┬───┘  │
│      │                    │                          │                │      │
│  ┌───▼──────────────┐ ┌───▼────────────────────┐ ┌───▼─────────────┐ ┌▼────┐ │
│  │ Terminal Operador│ │ Página de Catalogação  │ │ Painel de Risco │ │Filtro│ │
│  │ • Gráfico Candles│ │ • Ranking por Assertiv.│ │ • Martingale 1/2│ │Notíc.│ │
│  │ • EMAs 9/21, BB  │ │ • Win 1ª / Gale 1 / 2  │ │ • Soros / Níveis│ │Econ. │ │
│  │ • MHI 1/2/3 Status│ │ • Filtro M1 / M5 / OTC │ │ • SorosGale Auto│ │2 e 3 │ │
│  │ • Log de Ordens  │ │ • Botão "Operar Par"   │ │ • Stop Win/Loss │ │Touros│ │
│  └──────────────────┘ └────────────────────────┘ └─────────────────┘ └─────┘ │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ WebSocket Local (/ws) & REST (/api/*)
┌──────────────────────────────────────▼───────────────────────────────────────┐
│                    SERVIDOR NODE.JS / EXPRESS (PONTE API)                    │
│                                                                              │
│  ┌──────────────────────────────┐        ┌────────────────────────────────┐  │
│  │ Autenticador IQ Option       │        │ Motor de Execução & Ciclo      │  │
│  │ • POST /api/v2/login         │───────▶│ • Validação de Horário Server  │  │
│  │ • Extração/Validação de SSID │        │ • Cálculo Técnico (EMA/RSI/BB) │  │
│  └──────────────────────────────┘        │ • Disparo de Ordens & Gales    │  │
│                                          └───────────────┬────────────────┘  │
│                                                          │                   │
│  ┌───────────────────────────────────────────────────────▼────────────────┐  │
│  │ Cliente WebSocket IQ Option (wss://iqoption.com/echo/websocket)        │  │
│  │ • Assinatura de Candles (get-candles / candle-generated)               │  │
│  │ • Troca de Saldo (balance_id: Real / Practice)                         │  │
│  │ • Abertura e Monitoramento de Ordens (binary-options / digital-option) │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Modelo de Dados & Cálculo de Estratégias**:
  - **Família MHI (M1 e M5)**:
    - Agrupamento de velas em quadrantes de 5 minutos (M1) ou 30 minutos (M5).
    - Análise das últimas 3 velas do quadrante para identificar a cor minoritária (**MHI Minoria**, padrão clássico) ou majoritária (**MHI Maioria**).
    - Suporte a **MHI 1** (entrada na 1ª vela do novo quadrante), **MHI 2** (entrada na 2ª vela) e **MHI 3** (entrada na 3ª vela), com bloqueio opcional caso haja vela *Doji* na base de cálculo.
  - **Indicadores Técnicos de Confluência**:
    - **EMA 9 e EMA 21**: Filtro de tendência e cruzamento (só permite `CALL` quando EMA 9 > EMA 21 e preço acima das médias; `PUT` quando EMA 9 < EMA 21).
    - **RSI (Índice de Força Relativa)**: Período configurável (ex: 14) com zonas de sobrecompra (70) e sobrevenda (30) para confirmação de reversão ou força.
    - **Bandas de Bollinger (20, 2)**: Filtro de toque/rompimento das bandas superior e inferior.
    - **MACD (12, 26, 9)**: Confirmação de momentum pelo histograma.
    - **Suporte/Resistência & Price Action**: Detecção automática de topos e fundos fractais recentes e padrões de vela (**Engolfo de Alta/Baixa** e **Pinbar / Martelo**).

- **Mapeamento de Interações e Estados**:
  - **Autenticação & Chaveamento de Conta**: O modal de login valida e-mail/senha ou token `SSID` na API da IQ Option. Se a conta exigir autenticação de dois fatores (2FA) ou bloqueio de captcha na rota de login padrão, o usuário pode colar diretamente seu `SSID` obtido na sessão da corretora ou informar o código SMS/2FA. O seletor `CONTA TREINAMENTO` / `CONTA REAL` altera imediatamente o `balance_id` ativo para envio de ordens.
  - **Catalogação Interativa**: Ao alterar o timeframe (`M1`, `M5`), quantidade de quadrantes analisados (`Últimas 2h`, `4h`, `6h`, `12h`), variação MHI ou ativar a chave *"Catalogar com Filtro EMA 9/21"*, a grade recalcula instantaneamente a porcentagem de acerto de cada par e reordena o ranking do mais assertivo para o menos assertivo.
  - **Automação do Robô & Gestão de Banca**: Ao clicar em *"Iniciar Robô"*, o motor monitora a virada do quadrante nos pares selecionados. Antes de enviar a ordem (`CALL` ou `PUT`), verifica: (1) se o Stop Win ou Stop Loss foi atingido, (2) se há notícia de alto impacto no intervalo de pausa configurado, e (3) se todos os indicadores ativos estão em confluência. Caso a ordem feche em Loss, o sistema aciona automaticamente o Gale 1 (e Gale 2, se habilitado) ou recalcula a mão do ciclo Soros/SorosGale.
