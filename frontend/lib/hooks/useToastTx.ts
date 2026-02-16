"use client";

import * as React from "react";
import { toast } from "sonner";

import { shortenHex } from "@/lib/format";

export function useToastTx(hash?: `0x${string}`, label?: string) {
  const toastId = React.useRef<string | number | null>(null);

  React.useEffect(() => {
    if (!hash) return;
    const title = label ?? "Transaction sent";
    toastId.current = toast.loading(title, { description: shortenHex(hash) });
    return () => {
      toastId.current = null;
    };
  }, [hash, label]);

  const success = React.useCallback((message: string) => {
    if (toastId.current) {
      toast.success(message, { id: toastId.current });
    } else {
      toast.success(message);
    }
  }, []);

  const fail = React.useCallback((message: string) => {
    if (toastId.current) {
      toast.error(message, { id: toastId.current });
    } else {
      toast.error(message);
    }
  }, []);

  return { success, fail };
}
