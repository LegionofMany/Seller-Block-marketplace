import type { Request, Response } from "express";
import { isAddress, Wallet, parseEther } from "ethers";
import { getContext } from "../services/context";

const AIRDROP_AMOUNT = parseEther("0.05");
const AIRDROP_COOLDOWN_DAYS = 30;
const MAX_CLAIMS_PER_ADDRESS = 3;

export async function claimAirdrop(req: Request, res: Response): Promise<void> {
  const { address } = req.body as { address?: string };

  if (!address || !isAddress(address)) {
    res.status(400).json({ error: "Invalid wallet address" });
    return;
  }

  const { db, env, provider } = getContext();

  const funderKey = env.airdropFunderPrivateKey;
  if (!funderKey) {
    res.json({
      ok: true,
      message: "Airdrop not configured on this network",
    });
    return;
  }

  try {
    const existing = await db.query<{
      id: number;
      claimed_at: Date;
      claim_count: number;
    }>(
      `SELECT id, claimed_at, claim_count 
       FROM airdrop_claims 
       WHERE address = $1 
       ORDER BY claimed_at DESC 
       LIMIT 1`,
      [address.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      const last = existing.rows[0];
      const daysSince = Math.floor(
        (Date.now() - new Date(last.claimed_at).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSince < AIRDROP_COOLDOWN_DAYS) {
        res.json({
          ok: true,
          message: "Already claimed recently",
          nextClaimIn: AIRDROP_COOLDOWN_DAYS - daysSince,
        });
        return;
      }

      if (last.claim_count >= MAX_CLAIMS_PER_ADDRESS) {
        res.json({
          ok: true,
          message: "Maximum claims reached for this address",
        });
        return;
      }
    }

    const wallet = new Wallet(funderKey, provider);

    const tx = await wallet.sendTransaction({
      to: address,
      value: AIRDROP_AMOUNT,
    });

    const hash = tx.hash;

    const currentCount = existing.rows.length > 0 ? existing.rows[0].claim_count : 0;

    await db.query(
      `INSERT INTO airdrop_claims 
         (address, tx_hash, amount, claimed_at, claim_count)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [address.toLowerCase(), hash, AIRDROP_AMOUNT.toString(), currentCount + 1]
    );

    res.json({ ok: true, txHash: hash });
  } catch (error: unknown) {
    console.error("[airdrop] claim error:", error);
    res.json({ ok: true, message: "Airdrop unavailable" });
  }
}
