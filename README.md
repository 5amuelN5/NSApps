# NS Apps

Juegos y herramientas para el navegador: https://5amueln5.github.io/NSApps/

La portada tiene dos secciones: **Juegos** (`#juegos`) y **Herramientas** (`#herramientas`).

Para añadir algo al menú: mete su carpeta aquí, una carátula 4:3 en `covers/<carpeta>.jpg` y una entrada en la lista `APPS` de `index.html` con `sec: 'juegos'` o `sec: 'herramientas'`.

## Juegos

| Juego | Jugar | Código |
|---|---|---|
| Dominium — conquista mundial por turnos, salas online con amigos y bots de 4 niveles | [`dominium/`](https://5amueln5.github.io/NSApps/dominium/) | [`src/dominium`](src/dominium) |
| Hexópolis — colonizar una isla, salas online con amigos y bots de 4 niveles | [`hexopolis/`](https://5amueln5.github.io/NSApps/hexopolis/) | [`src/hexopolis`](src/hexopolis) |
| MineMergeMatic — mina, fusiona y automatiza | [`minemergematic/`](https://5amueln5.github.io/NSApps/minemergematic/) | |
| Bills Must Be Paid — rompe huchas para pagar facturas | [`bills-must-be-paid/`](https://5amueln5.github.io/NSApps/bills-must-be-paid/) | |
| 2048 — con un bot que aprende a jugar | [`2048/`](https://5amueln5.github.io/NSApps/2048/) | |

## Herramientas

| Herramienta | Abrir | Código |
|---|---|---|
| Planta Libre — dibuja tu piso a escala, amuéblalo y recórrelo en 3D | [`planta-libre/`](https://5amueln5.github.io/NSApps/planta-libre/) | [`planta-libre/index.html`](planta-libre/index.html) (un solo archivo) |

Planta Libre funciona también descargando `planta-libre/index.html` y abriéndolo con doble clic. Los planos se guardan en el navegador; para pasarlos a otro ordenador usa Exportar → JSON.

## Cómo está montado Hexópolis

- `hexopolis/` — la web del juego que publica GitHub Pages (se genera con `npm run build`).
- `src/hexopolis/` — el código. El servidor de salas online corre gratis en Render (*Root Directory* `src/hexopolis`, `npm install`, `npm start`) y se actualiza solo con cada cambio en este repositorio.

Para regenerar la web tras un cambio:

```bash
cd src/hexopolis
SERVER_URL=https://hexopolis.onrender.com npm run build
rm -rf ../../hexopolis && cp -R dist ../../hexopolis
```

## Cómo está montado Dominium

- `dominium/` — la web del juego que publica GitHub Pages (se genera con `npm run build`).
- `src/dominium/` — el código. El servidor de salas online corre gratis en Render (*Root Directory* `src/dominium`, `npm install`, `npm start`) y se actualiza solo con cada cambio en este repositorio. No tiene dependencias.

Para regenerar la web tras un cambio:

```bash
cd src/dominium
SERVER_URL=https://dominium-gt9w.onrender.com npm run build
rm -rf ../../dominium && cp -R dist ../../dominium
```
