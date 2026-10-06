// Payment slips (revenue entries) and screenshots (outstanding payments). The browser shrinks a photo to a JPEG of
// about 100-300 KB (src/lib/image.ts) and sends it as a data URL; it is kept in public.attachments and only sent back
// one at a time (GET /attachments/{id}) to someone who may see the entry it belongs to - lists carry only the id.
import type { Ctx } from '../api/context';
import { uuidParam } from '../api/validate';
import type { Db } from '../db';
import { ApiError, notFound } from '../domain/errors';
import { rowScope } from './scope';

/** About 1.5 MB of base64 = 1.1 MB image: plenty for a shrunk photo, small enough for the free plan. */
export const MAX_DATA_URL = 1_500_000;
const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Checks a data URL from a form; null / '' = no image. Returns [mime, bytes] for saving. */
export function checkImage(field: string, v: unknown): { dataUrl: string; mime: string; bytes: number } | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') throw new ApiError(400, 'Malformed JSON request');
  if (v.length > MAX_DATA_URL) throw new ApiError(400, 'Validation failed', { [field]: 'image is too large (max about 1 MB after shrinking)' });
  const m = v.match(DATA_URL);
  if (!m) throw new ApiError(400, 'Validation failed', { [field]: 'must be a PNG, JPEG, WEBP or GIF image' });
  return { dataUrl: v, mime: m[1], bytes: Math.floor((m[2].length * 3) / 4) };
}

export async function saveImage(db: Db, userId: string, img: { dataUrl: string; mime: string; bytes: number }): Promise<string> {
  const uid = /^[0-9a-fA-F-]{36}$/.test(userId) ? userId : null;
  const [r] = await db`insert into public.attachments (mime, data, bytes, created_by)
                       values (${img.mime}, ${img.dataUrl}, ${img.bytes}, ${uid}::uuid) returning id::text`;
  return String(r.id);
}

export async function deleteImages(db: Db, ids: (string | null | undefined)[]): Promise<void> {
  const list = ids.filter((x): x is string => !!x);
  if (list.length) await db`delete from public.attachments where id in ${db(list)}`;
}

/** GET /attachments/{id}: the image, when the caller may see the revenue entry / outstanding row that uses it. */
export async function getAttachment(c: Ctx) {
  const id = uuidParam(c.params.id, 'Image');
  const { sql } = c;
  const [a] = await sql`
    select a.id::text, a.data from public.attachments a
    where a.id = ${id}::uuid and (
      exists (select 1 from public.revenue_entries r where r.slip_id = a.id ${rowScope(c, 'r')})
      or exists (select 1 from public.outstanding_payments o where o.screenshot_id = a.id ${rowScope(c, 'o')}))`;
  if (!a) throw notFound('Image', id);
  return { id: a.id, dataUrl: a.data };
}
