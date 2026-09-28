# 🔑 Sistema de Empréstimo de Chaves

Sistema web para gerenciamento do empréstimo e devolução de chaves dos laboratórios e demais ambientes de um departamento.

O projeto tem como objetivo centralizar o controle das chaves, permitindo consultar disponibilidade, solicitar empréstimos, realizar aprovações e acompanhar o histórico das movimentações.

---

## 📌 Sobre o projeto

Atualmente, o controle de empréstimo de chaves pode depender de processos manuais, dificultando o acompanhamento de:

* quais chaves estão disponíveis;
* quais chaves estão emprestadas;
* quem está utilizando determinada chave;
* quais solicitações aguardam aprovação;
* quando uma chave foi devolvida;
* histórico das movimentações.

O sistema será desenvolvido para digitalizar esse processo, proporcionando maior organização, controle e rastreabilidade.

---

## 🎯 Objetivos

### Objetivo geral

Desenvolver um sistema web para gerenciamento do empréstimo, aprovação, devolução e acompanhamento das chaves utilizadas nos laboratórios e ambientes do departamento.

### Objetivos específicos

* Permitir autenticação dos usuários;
* Integrar login utilizando Google Authentication;
* Cadastrar e controlar as chaves disponíveis;
* Consultar a disponibilidade das chaves;
* Permitir solicitações de empréstimo;
* Permitir aprovação ou negação das solicitações;
* Registrar devoluções;
* Manter histórico dos empréstimos;
* Controlar permissões de acordo com o perfil do usuário;
* Implementar políticas de segurança utilizando RLS;
* Registrar ações importantes para auditoria.

---

# 🏗️ Arquitetura

O sistema será desenvolvido utilizando uma arquitetura baseada em frontend web e serviços do Supabase.

```text
                    SISTEMA
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
     FRONTEND                    SUPABASE
          │                         │
   HTML / CSS / JS          ┌────────┼─────────┐
                            │        │         │
                            ▼        ▼         ▼
                           Auth   Database    RLS
                            │      PostgreSQL
                            │        │
                            │        ├── Triggers
                            │        ├── Functions
                            │        └── Audit
                            │
                            ▼
                      Google Authentication
```

---

# 🛠️ Tecnologias

## Frontend

* HTML5
* CSS3
* JavaScript

## Backend / Serviços

* Supabase
* PostgreSQL
* Supabase Auth
* Row Level Security (RLS)
* Database Triggers
* Database Functions
* Edge Functions, quando necessárias

## Autenticação

* Google OAuth
* Supabase Auth

## Controle de versão

* Git
* GitHub
* Visual Studio Code

---

# 👥 Perfis de usuário

O sistema será inicialmente dividido em três perfis.

### Usuário

Pode:

* realizar login;
* visualizar chaves;
* consultar disponibilidade;
* solicitar empréstimos;
* visualizar seus próprios empréstimos;
* acompanhar o status das solicitações;
* acompanhar devoluções.

### Aprovador

Pode:

* visualizar solicitações;
* aprovar empréstimos;
* negar empréstimos;
* consultar chaves;
* acompanhar empréstimos ativos;
* registrar devoluções, conforme as regras definidas.

### Administrador

Pode:

* gerenciar usuários;
* gerenciar perfis;
* cadastrar chaves;
* alterar informações das chaves;
* desativar chaves;
* acompanhar empréstimos;
* acessar informações de auditoria;
* administrar configurações do sistema.

---

# 🔄 Fluxo principal

```text
Usuário
   │
   ▼
Login com Google
   │
   ▼
Sistema identifica o perfil
   │
   ▼
Consulta disponibilidade
   │
   ▼
Solicita empréstimo
   │
   ▼
Aguardando aprovação
   │
   ├───────────────┐
   ▼               ▼
Aprovado         Negado
   │
   ▼
Chave emprestada
   │
   ▼
Devolução
   │
   ▼
Chave disponível novamente
```

---

# 🗂️ Estrutura do projeto

```text
sistema-emprestimo-chaves/
│
├── frontend/
│   │
│   ├── pages/
│   │   ├── index.html
│   │   ├── login.html
│   │   └── dashboard.html
│   │
│   ├── css/
│   │   └── global.css
│   │
│   ├── js/
│   │   ├── supabase.js
│   │   └── auth.js
│   │
│   └── assets/
│
├── supabase/
│   │
│   ├── migrations/
│   ├── functions/
│   └── seed.sql
│
├── docs/
│
├── .gitignore
└── README.md
```

---

# 📁 Descrição das pastas

## `frontend/`

Contém toda a aplicação que será executada pelo navegador.

### `frontend/pages/`

Contém as páginas HTML do sistema.

Exemplos:

```text
login.html
dashboard.html
chaves.html
emprestimos.html
aprovacao.html
```

### `frontend/css/`

Contém os estilos visuais da aplicação.

Exemplos:

```text
global.css
login.css
dashboard.css
```

### `frontend/js/`

Contém os scripts JavaScript responsáveis pela lógica da interface e comunicação com o Supabase.

Exemplos:

```text
supabase.js
auth.js
chaves.js
emprestimos.js
aprovacao.js
```

### `frontend/assets/`

Contém recursos visuais utilizados pelo frontend.

Exemplos:

```text
imagens/
icones/
logos/
```

---

# 📁 `supabase/`

Contém os elementos relacionados ao backend do projeto.

## `supabase/migrations/`

Armazena as alterações estruturais do banco de dados.

Exemplos:

```text
001_create_profiles.sql
002_create_keys.sql
003_create_loans.sql
004_create_audit_logs.sql
005_create_rls.sql
```

As migrations permitem que a estrutura do banco seja versionada juntamente com o código do projeto.

## `supabase/functions/`

Local destinado às Edge Functions do Supabase quando alguma lógica não puder ou não deva ser executada diretamente no frontend ou no banco.

## `supabase/seed.sql`

Contém dados iniciais utilizados durante o desenvolvimento e testes.

---

# 📁 `docs/`

Documentação técnica e de planejamento do projeto.

Exemplos:

```text
arquitetura.md
banco.md
regras-negocio.md
rls.md
fluxos.md
```

---

# 🗄️ Banco de dados

A estrutura inicial planejada inclui entidades como:

```text
profiles
keys
loans
audit_logs
```

### Profiles

Armazena informações complementares dos usuários autenticados.

### Keys

Representa as chaves cadastradas no sistema.

### Loans

Registra as solicitações e empréstimos realizados.

### Audit Logs

Registra ações relevantes realizadas no sistema.

---

# 🔐 Segurança

A segurança da aplicação será baseada principalmente em:

* Supabase Authentication;
* Google OAuth;
* Row Level Security (RLS);
* controle de funções por perfil;
* validações no banco de dados;
* constraints e relacionamentos;
* registro de auditoria.

A interface do frontend não será considerada responsável pela segurança. As regras críticas deverão ser protegidas também no banco de dados.

---

# 👨‍💻 Organização do desenvolvimento

O desenvolvimento será realizado utilizando Git e GitHub.

### Branch principal

```text
main
```

Representa versões estáveis do projeto.

### Branch de desenvolvimento

```text
dev
```

Utilizada para integração das funcionalidades antes de serem incorporadas à `main`.

### Branches de funcionalidades

Exemplos:

```text
feature/login
feature/database
feature/rls
feature/chaves
feature/emprestimos
feature/aprovacao
feature/dashboard
```

---

# 🔀 Fluxo de trabalho

```text
main
  │
  ▼
dev
  │
  ├── feature/login
  ├── feature/chaves
  ├── feature/emprestimos
  └── feature/aprovacao
```

Fluxo recomendado:

```text
1. Criar uma branch para a funcionalidade
2. Desenvolver
3. Fazer commits
4. Enviar para o GitHub
5. Abrir Pull Request
6. Revisar
7. Integrar na branch dev
8. Testar
9. Integrar na main quando estiver estável
```

---

# 📝 Padrão de commits

Os commits devem utilizar mensagens claras.

Exemplos:

```text
feat: adiciona tela de login
feat: cria cadastro de chaves
feat: adiciona solicitação de empréstimo
fix: corrige validação de disponibilidade
fix: corrige política RLS
docs: atualiza documentação do banco
refactor: reorganiza código de autenticação
chore: atualiza configuração do projeto
```

---

# 🚧 Status do projeto

**Em desenvolvimento**

### Etapas planejadas

* [x] Estrutura inicial do repositório
* [ ] Configuração do Supabase
* [ ] Configuração do Google Auth
* [ ] Modelagem do banco
* [ ] Criação das migrations
* [ ] Implementação das políticas RLS
* [ ] Sistema de login
* [ ] Cadastro de chaves
* [ ] Consulta de disponibilidade
* [ ] Solicitação de empréstimos
* [ ] Aprovação e negação
* [ ] Devolução
* [ ] Histórico
* [ ] Auditoria
* [ ] Dashboard
* [ ] Testes
* [ ] Deploy

---

# 👨‍👩‍👧‍👦 Desenvolvimento em equipe

Todas as alterações devem ser realizadas por meio de branches específicas.

Antes de iniciar uma nova tarefa:

```bash
git pull
```

Criar uma branch:

```bash
git checkout -b feature/nome-da-funcionalidade
```

Após concluir:

```bash
git add .
git commit -m "feat: descrição da alteração"
git push -u origin feature/nome-da-funcionalidade
```

Em seguida, abrir um Pull Request no GitHub.

---

# ⚠️ Segurança de credenciais

Nunca enviar para o GitHub:

```text
.env
senhas
tokens
service_role key
secret keys
credenciais privadas
```

Informações sensíveis devem ser armazenadas de forma segura e nunca inseridas diretamente no código público.

---

# 📌 Próximas etapas

A próxima etapa do desenvolvimento será:

```text
1. Criar projeto no Supabase
2. Definir estrutura do banco
3. Definir relacionamentos
4. Definir perfis
5. Definir regras de negócio
6. Criar migrations
7. Configurar RLS
8. Configurar Google Authentication
9. Começar o frontend
```

---

# 📄 Licença

Projeto desenvolvido para fins acadêmicos e/ou institucionais.

A definição da licença de distribuição deverá ser realizada posteriormente pela equipe.
