import { getContext } from "./context";
import { listPaymentsByStatus, updatePayment } from "./db";
import { relayAcceptOrderWithPermit } from "./settlement";

export type PaymentsWorkerStatus = {
  running: boolean;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  lastError?: string;
};

export function startPaymentsWorker() {
  const { db, env, logger } = getContext();
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  const status: PaymentsWorkerStatus = { running: false };

  const run = async () => {
    if (running) return;
    running = true;
    status.running = true;
    try {
      const items = await listPaymentsByStatus(db, "approved", 50);
      for (const p of items) {
        try {
          const meta = p.metadata ?? {};
          const order = meta.order as any | undefined;
          const permit = meta.permit as any | undefined;
          const sellerSignature = typeof meta.sellerSignature === "string" ? meta.sellerSignature : undefined;
          const buyerSignature = typeof meta.buyerSignature === "string" ? meta.buyerSignature : undefined;
          const buyer = typeof meta.buyer === "string" ? meta.buyer : undefined;
          const buyerDeadline = typeof meta.buyerDeadline === "number" ? meta.buyerDeadline : undefined;

          if (!order || !permit || !sellerSignature || !buyerSignature || !buyer || !buyerDeadline) {
            // Not enough settlement data — skip and let admin attach missing pieces
            continue;
          }

          const chainKey = p.listingChainKey ?? String(meta.chainKey ?? null);
          const result = await relayAcceptOrderWithPermit({
            chainKey: chainKey as string,
            order: order as any,
            buyer,
            buyerDeadline,
            sellerSignature,
            buyerSignature,
            permit: permit as { deadline: number; v: number; r: string; s: string },
          });

          const newMeta = { ...(p.metadata ?? {}), settlement: { txHash: result.txHash, escrowId: result.escrowId, orderHash: result.orderHash } };
          await updatePayment(db, {
            id: p.id,
            userAddress: p.userAddress,
            listingId: p.listingId ?? null,
            listingChainKey: p.listingChainKey ?? null,
            provider: p.provider,
            providerSessionId: p.providerSessionId ?? null,
            status: p.status,
            amount: p.amount,
            currency: p.currency,
            promotionType: p.promotionType ?? null,
            metadata: newMeta,
            updatedAt: Date.now(),
          });
        } catch (err: any) {
          logger.warn({ err, paymentId: p.id }, "payments worker relay failed for payment");
          const newMeta = { ...(p.metadata ?? {}), settlementError: String(err?.message ?? err) };
          try {
            await updatePayment(db, {
              id: p.id,
              userAddress: p.userAddress,
              listingId: p.listingId ?? null,
              listingChainKey: p.listingChainKey ?? null,
              provider: p.provider,
              providerSessionId: p.providerSessionId ?? null,
              status: "failed",
              amount: p.amount,
              currency: p.currency,
              promotionType: p.promotionType ?? null,
              metadata: newMeta,
              updatedAt: Date.now(),
            });
          } catch (e) {
            logger.warn({ err: e }, "failed to persist payment failure metadata");
          }
        }
      }

      status.lastSuccessAt = Date.now();
      delete status.lastError;
    } catch (err) {
      status.lastFailureAt = Date.now();
      status.lastError = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, "payments worker failed");
    } finally {
      running = false;
      status.running = false;
    }
  };

  void run();
  const intervalMs = Math.max((env as any).paymentsWorkerMs ?? 30_000, 10_000);
  timer = setInterval(() => void run(), intervalMs);

  return {
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    getStatus() {
      return { ...status };
    },
  };
}
