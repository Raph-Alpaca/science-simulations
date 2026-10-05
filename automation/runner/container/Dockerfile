# Official MCR OCI index observed 2026-10-04; matching npm Playwright 1.63.0.
FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
WORKDIR /app
# build-context.mjs supplies only explicitly listed trusted source and manifests.
COPY package.json package-lock.json ./
COPY apps/catalog/package.json ./apps/catalog/package.json
COPY apps/studio/package.json ./apps/studio/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
RUN node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)' \
 && npm ci --ignore-scripts --no-audit --no-fund --include=dev
COPY packages/contracts/ ./packages/contracts/
COPY automation/runner/ ./automation/runner/
ENV HOME=/tmp
USER pwuser
ENTRYPOINT ["node", "automation/runner/runtime-child.mjs", "--container"]
CMD []
