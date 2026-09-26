import { emitter, ToastKind } from './emitter';

export function showToast(msg: string, kind: ToastKind = 'ok') {
  emitter.emit('toast', { msg, kind });
}
