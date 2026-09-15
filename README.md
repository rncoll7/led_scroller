# LED Scroller

Letreiro de LED rolante feito como PWA: instala como app no Android e no iOS, abre em tela cheia, mantém a tela ligada e funciona offline.

Vite + TypeScript, sem dependências em runtime. O letreiro é desenhado por um shader WebGL2; sem WebGL2 ele usa um renderizador em DOM/CSS. O service worker é gerado pelo `vite-plugin-pwa`.

## Rodando

```bash
npm install
npm run dev       # desenvolvimento em http://localhost:5173
npm test          # testes da lógica (configurações, rotação, grade, rolagem)
npm run build     # checa tipos e gera dist/ com manifest e service worker
npm run preview   # serve o build em http://localhost:4173
```

O service worker só existe no build. Para testar instalação e modo offline use `npm run build && npm run preview`.

Parâmetros de URL úteis:

- `?stats` mostra o renderizador, a quantidade de LEDs, os quadros por segundo e o custo de CPU por quadro.
- `?renderer=css` força o renderizador sem WebGL.

## Testando no celular

Instalação e service worker exigem HTTPS (a única exceção é `localhost`). Abrir pelo IP da rede local mostra o letreiro, mas não instala nem funciona offline. Opções:

- **Android via USB:** `adb reverse tcp:4173 tcp:4173` e abra `http://localhost:4173` no Chrome do celular.
- **Túnel HTTPS:** `cloudflared tunnel --url http://localhost:4173` e abra a URL gerada.
- **Publicar:** o `dist/` é estático e roda em Cloudflare Pages, Netlify, Vercel ou GitHub Pages. Para publicar em subcaminho: `npm run build -- --base=/led_scroller/`.

## Instalando

- **Android (Chrome, Edge, Samsung Internet):** botão **Instalar app** no painel de configurações, ou menu do navegador → *Instalar app*.
- **iPhone e iPad:** o iOS não tem prompt de instalação. O botão **Instalar app** mostra o passo a passo: *Compartilhar → Adicionar à Tela de Início*.

## Usando

- Toque no letreiro para mostrar ou esconder os botões; eles somem sozinhos depois de alguns segundos. Toque duas vezes para tela cheia.
- O botão de ajustes abre o painel: texto, fonte, cores, velocidade, direção, rolagem suave, espelhar, linhas de LED, tamanho do LED, brilho, LEDs apagados, rotação e manter a tela ligada. As mudanças aparecem na hora e ficam salvas no aparelho.
- **Rotação automática:** em tela retrato o texto corre pelo lado comprido. Com a trava de rotação ligada, basta deitar o celular (topo para a esquerda).
- **Espelhar** inverte o letreiro na horizontal, para ser lido refletido num vidro.
- **Velocidade 0** deixa o letreiro parado, com o texto centralizado quando cabe na tela.
- Teclado: `Espaço` pausa, `F` tela cheia, `S` configurações, `Esc` fecha o painel.

## Desempenho

A versão anterior (canvas-sketch + Tweakpane) desenhava cada LED a cada quadro com `save/translate/arc/fill/restore` e montava uma string de cor por LED. A rolagem andava uma coluna por quadro, então ficava mais rápida em telas de 120 Hz.

Comparação de quatro formas de desenhar, no Chrome desktop, rolando uma coluna por quadro (quadros por segundo / ms de thread principal por quadro):

| LEDs | canvas `arc` por LED (antes) | um `<div>` por LED | CSS: canvas ampliado + máscara | WebGL2 shader |
| ---: | --- | --- | --- | --- |
| 3.640 | 60 / 3,2 ms | 60 / 3,7 ms | 60 / 0,27 ms | 60 / 0,16 ms |
| 15.360 | 60 / 14,4 ms | 55 / 17,0 ms | 60 / 0,32 ms | 60 / 0,21 ms |
| 61.440 | 12 / 80 ms | 4,5 / 215 ms | 60 / 0,58 ms | 60 / 0,24 ms |

Para rodar de novo (inclusive no celular): `npm run dev` e abra `/bench/`. A página aceita `?rows=20,40&ms=3000`.

- **Um elemento HTML por LED é o mais lento.** Cada passo da rolagem muda o estilo de milhares de elementos, e o navegador recalcula estilo e repinta todos eles.
- **DOM/CSS rápido é o fallback (`renderer/css.ts`).** Um único canvas com 1 pixel por LED é ampliado com `image-rendering: pixelated`, e uma `mask-image` repetida recorta as bolinhas. Por quadro é um `putImageData` de poucos milhares de pixels; ampliar e recortar fica com o compositor. Nesse modo não tem brilho.
- **WebGL2 é o caminho principal (`renderer/webgl.ts`).** Um triângulo cobre a tela e o fragment shader descobre a qual LED cada pixel pertence e lê o brilho numa textura de colunas × linhas. Por quadro a CPU envia essa textura (poucos KB) e faz uma chamada de desenho, então o custo não cresce com o número de LEDs. O brilho (halo que vaza para os vizinhos) sai quase de graça no mesmo shader.

CPU de celular é bem mais lenta que a desse desktop, então lá a diferença entre as colunas é maior.

Outros ganhos:

- rolagem por tempo (LEDs por segundo), igual em 60 Hz e 120 Hz;
- o texto é rasterizado uma vez a cada mudança, não a cada quadro, e mensagens longas são desenhadas em fatias (sem estourar o limite de largura do canvas);
- sem rolagem suave, só redesenha quando o texto anda uma coluna; parado, pausado ou com a aba oculta, o loop para;
- densidade de pixels limitada a 2×;
- botões e painel com fundo sólido: `backdrop-filter` teria que refazer o desfoque a cada quadro do letreiro;
- se o sistema derrubar o contexto WebGL (app em segundo plano), ele é recriado.

## Estrutura

```
src/
  main.ts            loop, layout, controles, tela cheia, wake lock, PWA
  panel.ts           painel de configurações, gerado a partir de uma lista de controles
  settings.ts        tipos, limites, padrões e validação das configurações
  storage.ts         salva as configurações (localStorage)
  bitmap.ts          rasteriza o texto a 1 pixel por LED
  scroll.ts          laço da mensagem, rolagem por tempo e composição do quadro de LEDs
  layout.ts          rotação do letreiro e grade de LEDs
  pwa.ts             registro do service worker e botão de instalar
  renderer/
    webgl.ts         renderizador WebGL2
    css.ts           fallback em DOM/CSS
bench/               comparação dos renderizadores (só no dev)
assets/              SVGs dos ícones (fonte)
public/              ícones PNG gerados (npm run icons, precisa de rsvg-convert)
```
