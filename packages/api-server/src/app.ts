import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload';
import { FastifyPluginAsync, RawServerDefault } from 'fastify';
import fastifyMySQL, { MySQLPromisePool } from '@fastify/mysql';

import { APIServerEnvSchema } from './env';
import { JsonSchemaToTsProvider } from '@fastify/type-provider-json-schema-to-ts';
import fastifyEnv from '@fastify/env';
import { join } from 'path';
import {APIError} from "./utils/error";

export type AppOptions = {
  // Place your custom options for app below here.
} & Partial<AutoloadPluginOptions>;

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
}

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      CONFIGS_PATH: string;
      ADMIN_EMAIL: string;
      DATABASE_URL: string,
      REDIS_URL: string,
      API_BASE_URL: string,
      ENABLE_CACHE: boolean,
      PLAYGROUND_DATABASE_URL: string,
      PLAYGROUND_DAILY_QUESTIONS_LIMIT: number;
      PLAYGROUND_TRUSTED_GITHUB_LOGINS: string[];
      GITHUB_OAUTH_CLIENT_ID?: string,
      GITHUB_OAUTH_CLIENT_SECRET?: string,
      GITHUB_ACCESS_TOKENS: string[],
      JWT_SECRET?: string,
      JWT_COOKIE_NAME?: string,
      JWT_COOKIE_DOMAIN?: string,
      JWT_COOKIE_SECURE?: boolean,
      JWT_COOKIE_SAME_SITE?: boolean,
      OPENAI_API_KEY: string
    };
    mysql: MySQLPromisePool
  }
}

const app: FastifyPluginAsync<AppOptions, RawServerDefault, JsonSchemaToTsProvider> = async (
    fastify,
    opts
): Promise<void> => {

  // Load config.
  await fastify.register(fastifyEnv, {
    confKey: 'config',      // You can access environment variables via `fastify.config`.
    dotenv: true,
    schema: APIServerEnvSchema
  });

  // Init MySQL Client.
  if (process.env.NODE_ENV === 'test' && (/tidb-cloud|gharchive_dev|github_events_api/.test(fastify.config.DATABASE_URL))) {
    throw new Error('Do not use online database in test env.');
  }
  await fastify.register(fastifyMySQL, {
    promise: true,
    connectionString: fastify.config.DATABASE_URL
  }).ready(async () => {
    try {
      await fastify.mysql.pool.query(`SELECT 1`);
      fastify.log.info('Connected to MySQL/TiDB database.');
    } catch(err) {
      fastify.log.error(err, 'Failed to connect to MySQL/TiDB database.');
    }
  });

  // Error handler.
  fastify.setErrorHandler(function (error: Error, request, reply) {
    this.log.error(error);

    if (error instanceof APIError) {
      reply.status(error.statusCode).send({
        message: error.message
      });
    } else {
      reply.status(500).send({
        message: error.message || 'Internal Server Error'
      });
    }
  });

  // This loads all plugins defined in plugins.
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts
  })

  // This loads all plugins defined in routes
  // define your routes in one of these.
  await fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    routeParams: true,
    options: opts
  });

  // Expose Swagger JSON.
  fastify.get('/docs/json', (req, reply) => {
    reply.send(fastify.swagger());
  })
};

export default app;
export { app, options };

