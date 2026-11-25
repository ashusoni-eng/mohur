export type Query = Promise<Record<string, string | string[] | undefined>>;
/** First value of each query parameter. */
export async function query(q: Query): Promise<Record<string, string | undefined>> {
  return Object.fromEntries(Object.entries(await q).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
