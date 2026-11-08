# CRM Truckfort — app (parte 2)

CRM comercial da Truckfort. A ZAY (agente) alimenta sozinha e os vendedores usam pela tela.
Por enquanto roda no seu PC para a gente ver funcionando; depois sobe para o VPS para a equipe.

## O que tem aqui
- `schema.sql` — modelo de dados (testado).
- `lib/db.ts` — conexão com o PostgreSQL; aplica o schema sozinho na 1ª vez.
- `lib/crm/repo.ts` — operações (empresas, contatos, negócios, funil, tarefas, histórico) — testadas.
- `app/` — a tela do funil + a API que o agente usa.

## Como rodar no PC (uma vez)
1. Coloque esta pasta em `Documents\Zay\zay-crm`.
2. Crie o arquivo de conexão. Copie `.env.example` para `.env.local` e preencha o `DATABASE_URL`
   com os dados do EasyPanel (serviço crm-truckfort → Credenciais). Formato:
   `postgres://USUARIO:SENHA@HOST:PORTA/BANCO`
   IMPORTANTE: use o endereço EXTERNO (o IP do seu VPS), não um host interno tipo "crm-truckfort".
   Se nas credenciais só aparecer um host interno, me avise que eu te mostro como liberar o acesso.
3. No PowerShell:
   cd C:\Users\herik\Documents\Zay\zay-crm; npm install
4. Depois:
   cd C:\Users\herik\Documents\Zay\zay-crm; npm run dev
5. Abra http://localhost:3001 — deve aparecer o funil (vazio no começo).

## API que o agente usa (já pronta)
- POST /api/crm/lead — registra empresa + contato + negócio (sem duplicar).
- POST /api/crm/atividade — cria tarefa (sem repetir).
- POST /api/crm/interacao — registra um resumo no histórico.
- GET  /api/crm/funil — o funil por etapa.
- GET  /api/crm/parados — negócios e tarefas que precisam de atenção.

## Próximos passos (eu construo)
- Tela: lista de negócios, página do negócio, tarefas, login por vendedor.
- Agente comercial: usar estas APIs para gerar agenda, WhatsApp e follow-up.
- Depois: subir tudo para o VPS (para a equipe) e ligar o atendimento comercial.
