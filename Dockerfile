FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run verify:bundle -- --report /app/BUNDLE_BUDGET.json

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV CONTRACTOR_AI_BIND_HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/BUNDLE_BUDGET.json ./BUNDLE_BUDGET.json
COPY identity-registry.js identity-runtime.js identity-server.js identity-oidc-adapter.js identity-recovery.js ./
COPY company-authority.js company-handover.js backup-evidence.js ./
COPY work-context.js ./
COPY work-delivery.js ./
COPY work-balance.js client-date-commitments.js ./
COPY operational-recovery.js ./
COPY variation-implementation.js ./
COPY asset-history.js ./
COPY inspection-coverage.js ./
COPY client-delivery.js ./
COPY image-processor.js ./
COPY client-completion-review.js contractual-closeout.js conversation-analysis-queue.js ./
COPY field-safety-projection.js field-task-scope.js jha-safety-definition.js task-jha-applicability.js ./
COPY resource-planner.js resource-planner-worker.js shared-material-stock.js supplier-performance.js ./
COPY submittal-attachment-manifest.js work-board-company-scope.js worker-availability-recurrence.js ./
COPY server.js operating-ledger.js company-runtime.js contractor-review.js field-work-pack.js work-board.js work-board-routes.js client-conversation.js conversation-routes.js conversation-analysis.js whatsapp-channel.js framework-catalog.js contractor-framework-catalog.json weather-service.js evidence-storage.js hai-connector.js postgres-sync-database.js postgres-sync-worker.js backup-manifest.js runtime-lock.js csv-safety.js bounded-json.js multipart-parser.js ./
COPY scripts/restore-local-backup.js ./scripts/restore-local-backup.js
COPY scripts/migrate-local-backup-to-hosted.js ./scripts/migrate-local-backup-to-hosted.js
COPY scripts/runtime-healthcheck.js ./scripts/runtime-healthcheck.js
COPY scripts/identity-maintenance.js ./scripts/identity-maintenance.js
COPY scripts/company-handover.js ./scripts/company-handover.js
COPY docs/IDENTITY_AND_MEMBERSHIP.md docs/IDENTITY_RECOVERY.md docs/TOTAL_SOLUTION_DELIVERY.md docs/COMPANY_ENVIRONMENTS.md ./docs/
COPY docs/COMPANY_HANDOVER.md ./docs/
COPY docs/SHARED_WORK_MODEL.md docs/WORK_DELIVERIES.md ./docs/
COPY docs/INSTALLED_ASSET_HISTORY.md ./docs/
COPY docs/INSPECTION_COVERAGE.md ./docs/
COPY docs/CLIENT_DELIVERIES.md ./docs/
COPY docs/WORK_BALANCE.md ./docs/
COPY docs/EU_HOSTING.md ./docs/
COPY docs/adr/0001-separate-identity-registry.md docs/adr/0002-registry-recovery-does-not-restore-access.md ./docs/adr/
COPY docs/adr/0003-company-authority-handover.md ./docs/adr/
RUN mkdir -p /var/lib/contractor-ai/uploads && chown -R node:node /var/lib/contractor-ai
USER node
ENV STATE_FILE=/var/lib/contractor-ai/server-state.json
ENV LEDGER_DB_FILE=/var/lib/contractor-ai/contractor-ledger.sqlite
ENV UPLOAD_DIR=/var/lib/contractor-ai/uploads
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=8s --start-period=15s --retries=3 CMD node scripts/runtime-healthcheck.js
CMD ["node", "server.js"]
