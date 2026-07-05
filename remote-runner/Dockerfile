FROM node:22-bookworm

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
RUN npx playwright install chromium --with-deps
COPY server.js ./

ENV PORT=8787
EXPOSE 8787
CMD ["npm", "start"]
