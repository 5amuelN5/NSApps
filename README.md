# NS Games

Juegos para el navegador: https://5amueln5.github.io/nsgames/

Para añadir un juego al menú: mete su carpeta aquí, una carátula 4:3 en `covers/<carpeta>.jpg` y una entrada en la lista `GAMES` de `index.html`.

| Juego | Jugar | Código |
|---|---|---|
| Hexópolis — colonizar una isla, salas online con amigos y bots de 4 niveles | [`hexopolis/`](https://5amueln5.github.io/nsgames/hexopolis/) | [`src/hexopolis`](src/hexopolis) |
| MineMergeMatic — mina, fusiona y automatiza | [`minemergematic/`](https://5amueln5.github.io/nsgames/minemergematic/) | |
| Bills Must Be Paid — rompe huchas para pagar facturas | [`bills-must-be-paid/`](https://5amueln5.github.io/nsgames/bills-must-be-paid/) | |
| 2048 — con un bot que aprende a jugar | [`2048/`](https://5amueln5.github.io/nsgames/2048/) | |

## Cómo está montado Hexópolis

- `hexopolis/` — la web del juego que publica GitHub Pages (se genera con `npm run build`).
- `src/hexopolis/` — el código. El servidor de salas online corre gratis en Render (*Root Directory* `src/hexopolis`, `npm install`, `npm start`) y se actualiza solo con cada cambio en este repositorio.

Para regenerar la web tras un cambio:

```bash
cd src/hexopolis
SERVER_URL=https://hexopolis.onrender.com npm run build
rm -rf ../../hexopolis && cp -R dist ../../hexopolis
```
