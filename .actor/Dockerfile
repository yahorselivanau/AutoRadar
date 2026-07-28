FROM mcr.microsoft.com/playwright:v1.62.0-noble

WORKDIR /usr/src/app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY actors/search/package.json actors/search/package.json

RUN pnpm install --frozen-lockfile --filter @autoradar/search-actor...

COPY packages/domain packages/domain
COPY actors/search actors/search

CMD ["pnpm", "--filter", "@autoradar/search-actor", "actor:start"]
