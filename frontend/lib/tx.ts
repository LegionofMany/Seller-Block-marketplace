"use client";

import { toast } from "sonner";

export function toastTxPending(label: string) {
  return toast.loading(label);
}

export function toastTxSuccess(id: string | number, label: string) {
  toast.success(label, { id });
}

export function toastTxError(id: string | number, message: string) {
  toast.error(message, { id });
}
