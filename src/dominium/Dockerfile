FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY public ./public
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server/server.js"]
