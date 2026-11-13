# NS Games

Juegos para el navegador.

| Juego | Jugar | Código |
|---|---|---|
| ⬢ Hexópolis — colonizar una isla hexagonal, salas online con amigos y bots de 4 niveles | [`hexopolis/`](https://5amueln5.github.io/nsgames/hexopolis/) | [`src/hexopolis`](src/hexopolis) |

## Cómo está montado Hexópolis

- `hexopolis/` — la web del juego que publica GitHub Pages (se genera con `npm run build`).
- `src/hexopolis/` — el código. El servidor de salas online corre gratis en Render (*Root Directory* `src/hexopolis`, `npm install`, `npm start`) y se actualiza solo con cada cambio en este repositorio.

Para regenerar la web tras un cambio:

```bash
cd src/hexopolis
SERVER_URL=https://<servidor>.onrender.com npm run build
rm -rf ../../hexopolis && cp -R dist ../../hexopolis
```
