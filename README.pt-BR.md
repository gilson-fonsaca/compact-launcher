# Compact Launcher

Um lançador de aplicativos compacto e flutuante para o GNOME Shell, inspirado no Launchpad do macOS.
Adiciona um botão à dock (Ubuntu Dock / Dash to Dock) que abre uma grade de ícones com todos os
aplicativos instalados — sem barra de pesquisa, basta rolar e clicar para abrir.

![GNOME Shell 47+](https://img.shields.io/badge/GNOME%20Shell-47%2B-blue)
![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)

> 📖 [Read in English](README.md)

---

## Funcionalidades

- **Grade de aplicativos rolável** — todos os apps instalados em ordem alfabética
- **Sem barra de pesquisa** — basta rolar e clicar para abrir
- **Navegação por teclado** — setas para mover na grade, `Enter` para abrir, `Esc` para fechar
- **Zoom no hover** — ícones ampliam levemente ao passar o mouse, no estilo GNOME
- **Animações suaves** — escala + fade ao abrir e fechar (duração configurável)
- **Fechar clicando fora** — clique em qualquer lugar (qualquer monitor) para fechar
- **Integração com a dock** — botão inserido em cada dock de cada monitor
- **Multi-monitor** — um botão por dock, popup abre no monitor ativo
- **Filtro de aplicativos ocultos** — exclua apps por nome exato ou curinga (ex.: `Libre*`)
- **Totalmente configurável** — todos os parâmetros de layout e aparência editáveis
- **Tema automático** — cores seguem o tema GNOME ativo (escuro / claro)
- **Compatível com Wayland** — nenhuma API X11 utilizada

---

## Requisitos

| Requisito | Versão |
|---|---|
| GNOME Shell | 47, 48 ou 49 |
| GJS | 1.76+ (incluso no GNOME 47) |
| Ubuntu Dock / Dash to Dock | qualquer versão recente |
| Tipo de sessão | X11 ou Wayland |

---

## Instalação

### Usando o script de instalação (recomendado)

```bash
git clone https://github.com/gilsonf/compact_launcher.git
cd compact_launcher
bash install.sh
```

O script irá:
1. Copiar todos os arquivos para `~/.local/share/gnome-shell/extensions/compact-launcher@gilsonf/`
2. Compilar o schema do GSettings
3. Habilitar a extensão automaticamente (se o GNOME Shell estiver em execução)

> **Após a instalação:** faça logout e login novamente para que o GNOME Shell carregue a extensão completamente.

### Instalação manual

```bash
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/compact-launcher@gilsonf"
mkdir -p "$EXT_DIR/schemas"

cp metadata.json extension.js prefs.js stylesheet.css "$EXT_DIR/"
cp schemas/*.xml "$EXT_DIR/schemas/"
glib-compile-schemas "$EXT_DIR/schemas/"

gnome-extensions enable compact-launcher@gilsonf
# Depois faça logout e login novamente
```

---

## Desinstalação

```bash
bash uninstall.sh
```

O script desabilita a extensão, limpa todas as preferências salvas e remove o diretório da extensão.

---

## Como usar

| Ação | Resultado |
|---|---|
| Clicar no ícone de grade na dock | Abrir/fechar o launcher |
| `↑ ↓ ← →` | Navegar pela grade de ícones |
| `Enter` | Abrir o app em foco |
| `Esc` | Fechar o launcher |
| Clicar fora do popup | Fechar o launcher (qualquer monitor) |

---

## Configurações

Abra a tela de configurações pelo app **Extensões** do GNOME e escolha **Configurações da Extensão**.

### Aba Ícones

| Parâmetro | Descrição |
|---|---|
| Tamanho do ícone (px) | Tamanho da imagem do ícone do app |
| Largura / altura do tile (px) | Dimensões de cada célula da grade |
| Espaçamento horizontal / vertical (px) | Espaço entre células |
| Tamanho do ícone na dock (px) | Tamanho do ícone do botão na dock |
| Ocultar botão "Mostrar Aplicativos" padrão | Substitui o lançador nativo pelo nosso |
| Posição do botão na dock | Esquerda (primeiro) ou Direita (último) |
| Duração da animação (ms) | Velocidade da animação de abertura/fechamento (0 = desativar) |

### Aba Layout

| Parâmetro | Descrição |
|---|---|
| Largura / Altura máxima (px) | Dimensões do popup em pixels |
| Margem interna da grade (px) | Inset subtraído ao calcular colunas (evita overflow) |
| Margem superior (fração) | Distância mínima do topo do monitor |
| Margem inferior (fração) | Âncora principal — borda inferior do popup fica acima da dock |
| Mín / Máx de colunas | Limites da contagem de colunas (0 = máximo automático) |

### Aba Filtros

Adicione nomes exatos ou padrões com curinga para ocultar apps da grade:

| Padrão | Efeito |
|---|---|
| `Logs` | Oculta o app cujo nome é exatamente "Logs" |
| `Libre*` | Oculta todos os apps cujo nome começa com "Libre" |
| `*Office*` | Oculta todos os apps cujo nome contém "Office" |

---

## Estrutura de Arquivos

```
compact_launcher/
├── metadata.json       Manifesto da extensão (UUID, versão do GNOME Shell, schema)
├── extension.js        Toda a lógica — ES modules, APIs do GNOME Shell 47+
├── prefs.js            Tela de configurações (Adwaita / GTK4)
├── stylesheet.css      CSS — sem cores fixas, segue o tema do sistema
├── install.sh          Script de instalação
├── uninstall.sh        Script de desinstalação
├── schemas/
│   └── org.gnome.shell.extensions.compact-launcher.gschema.xml
└── LICENSE             GNU General Public License v3.0
```

---

## Arquitetura

```
CompactLauncherExtension          Ponto de entrada da extensão
  ├── CompactLauncherPopup        Janela popup flutuante
  │     ├── St.Widget (overlay)   Fundo transparente cobrindo toda a tela
  │     ├── St.ScrollView         Contêiner rolável
  │     └── Clutter.GridLayout    Grade de ícones — colunas calculadas dinamicamente
  │           └── AppIcon[]       St.Button + ícone + rótulo com quebra de linha
  │
  └── DashLauncherButton          Gerenciador do botão na dock
        ├── St.Button × N         Um botão por dock (um por monitor)
        ├── Tooltip                Rótulo "Applications" ao passar o mouse
        └── PopupMenu             Menu de contexto (clique com botão direito)
```

Todos os valores configuráveis pelo usuário são armazenados no **GSettings**
(`org.gnome.shell.extensions.compact-launcher`) e lidos a cada abertura do popup.
Alterações de espaçamento aplicam imediatamente; alterações de tamanho/layout aplicam
na próxima abertura.

---

## Desenvolvimento

```bash
# Monitorar logs do GNOME Shell em tempo real
journalctl -f -o cat /usr/bin/gnome-shell

# Filtrar apenas mensagens da extensão
journalctl -f -o cat /usr/bin/gnome-shell | grep CompactLauncher

# Recarregar após editar (Wayland — requer reinício de sessão)
# Faça logout → login novamente

# Recarregar após editar (apenas X11)
# Alt+F2 → digite 'r' → Enter

# Deploy rápido durante o desenvolvimento
EXT="$HOME/.local/share/gnome-shell/extensions/compact-launcher@gilsonf"
cp extension.js prefs.js stylesheet.css "$EXT/"
gnome-extensions disable compact-launcher@gilsonf
gnome-extensions enable compact-launcher@gilsonf
```

---

## Licença

Este projeto está licenciado sob a **GNU General Public License v3.0**.  
Veja o arquivo [LICENSE](LICENSE) para o texto completo.
