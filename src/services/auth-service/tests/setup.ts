/**
 * Test bootstrap (loaded with `-r` before every test file).
 *
 * Tests never reach a real database or Kafka: the pool's query/connect are replaced
 * by the in-memory FakeDb (tests/support/fake-db.ts) before any service call, and the
 * settings below make sure nothing the modules do at import time can reach a server.
 */
process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '1';
process.env.DB_NAME = 'auth_service_unit_tests';
process.env.KAFKA_BOOTSTRAP_SERVERS = '';
process.env.LOG_LEVEL = 'error';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_EXPIRES_IN = '1h';
