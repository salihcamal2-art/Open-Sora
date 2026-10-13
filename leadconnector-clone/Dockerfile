FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server/ ./server/
COPY --from=client /app/client/dist ./client/dist
ENV PORT=4000 DATA_DIR=/data
VOLUME /data
EXPOSE 4000
CMD ["node", "--no-warnings", "server/src/index.js"]
HEALTHCHECK CMD wget -qO- http://localhost:${PORT:-4000}/api/health || exit 1
