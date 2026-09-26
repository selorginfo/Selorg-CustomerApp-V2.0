import mitt from 'mitt';

export type ToastKind = 'ok' | 'err' | 'info';

export interface ToastPayload {
  msg: string;
  kind: ToastKind;
}

export type EmitterEvents = {
  applyDiscount: string;
  toast: ToastPayload;
};

export const emitter = mitt<EmitterEvents>();
