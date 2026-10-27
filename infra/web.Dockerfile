FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci --ignore-scripts
COPY apps/web apps/web
COPY packages/contracts packages/contracts
COPY docs/architecture/api-phase05.d.ts docs/architecture/api-phase05.d.ts
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
USER node
CMD ["npm", "run", "start", "--workspace", "@veyra/web", "--", "--hostname", "0.0.0.0"]
