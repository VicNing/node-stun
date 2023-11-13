export const enum LazyPromiseStatus {
  init,
  resolved,
  rejected,
}

export class LazyPromise<T> {
  private _promise: Promise<T>;
  private _status: LazyPromiseStatus = LazyPromiseStatus.init;
  private resolvePromise?: (val: T) => void;
  private rejectPromise?: (err: any) => void;

  public get promise(): Promise<T> {
    return this._promise;
  }

  public get status(): LazyPromiseStatus {
    return this._status;
  }

  public constructor() {
    this._promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  public resolve(val: T) {
    this._status = LazyPromiseStatus.resolved;
    this.resolvePromise?.(val);
  }

  public reject(err: any) {
    this._status = LazyPromiseStatus.rejected;
    this.rejectPromise?.(err);
  }
}
