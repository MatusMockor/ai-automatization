FROM node:22-alpine

RUN apk add --no-cache git

RUN npm install -g @anthropic-ai/claude-code

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

CMD ["npm", "run", "start:dev"]
