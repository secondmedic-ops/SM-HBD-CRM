import type { Sql } from '../db';
import type { Env } from '../env';
import type { User } from './auth';

/** Everything a handler needs for one request. */
export interface Ctx {
  sql: Sql;
  env: Env;
  user: User;
  url: URL;
  params: Record<string, string>;
  req: Request;
}
