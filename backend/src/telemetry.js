'use strict';

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (!otlpEndpoint) {
  console.log('[telemetry] OTEL_EXPORTER_OTLP_ENDPOINT not set, tracing disabled');
} else {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { Resource } = require('@opentelemetry/resources');
  const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

  const serviceName = process.env.OTEL_SERVICE_NAME || 'todo-backend';

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${otlpEndpoint.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[telemetry] OpenTelemetry started, exporting to ${otlpEndpoint}`);

  process.on('SIGTERM', () => {
    sdk.shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}