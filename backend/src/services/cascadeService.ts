import { getContext } from "./context";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

// saleType: 0 = fixed, 1 = auction, 2 = raffle
function nextSaleType(current: number): number {
  if (current === 0) return 1; // fixed → auction
  if (current === 1) return 2; // auction → raffle
  return 2;                    // raffle stays raffle
}

export async function runSaleCascade(): Promise<{
  processed: number;
  errors: number;
}> {
  const { db } = getContext();
  let processed = 0;
  let errors = 0;

  try {
    // PostgreSQL lowercases unquoted identifiers
    // so columns are: saletype, cascade_stage, original_sale_type
    const due = await db.query<{
      id: string;
      saletype: number;
      cascade_stage: number;
      original_sale_type: number;
    }>(
      `SELECT id, saletype, cascade_stage, original_sale_type
       FROM listings
       WHERE active = 1
         AND cascade_stage < 2
         AND cascade_at IS NOT NULL
         AND cascade_at <= NOW()
       LIMIT 100`
    );

    for (const row of due.rows) {
      try {
        const next = nextSaleType(row.saletype);
        const newStage = row.cascade_stage + 1;
        const nextCascadeAt = newStage < 2
          ? new Date(Date.now() + NINETY_DAYS_MS)
          : null;

        await db.query(
          `UPDATE listings
           SET saletype = $1,
               cascade_stage = $2,
               cascade_at = $3
           WHERE id = $4`,
          [next, newStage, nextCascadeAt, row.id]
        );

        processed++;
      } catch {
        errors++;
      }
    }
  } catch (err) {
    console.error("[cascadeService] runSaleCascade error:", err);
    errors++;
  }

  return { processed, errors };
}

export function getSaleCascadeDefaults(isPublic: boolean): {
  saleType: number;
  cascadeStage: number;
  listedAt: Date;
  cascadeAt: Date;
} {
  const now = new Date();
  const cascadeAt = new Date(now.getTime() + NINETY_DAYS_MS);

  return {
    // Public listings default to raffle (2)
    // Regular listings default to fixed (0)
    saleType: isPublic ? 2 : 0,
    cascadeStage: 0,
    listedAt: now,
    cascadeAt,
  };
}
