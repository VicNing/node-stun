import { Socket, createSocket } from "node:dgram";
import { homedir } from "node:os";
import { LazyPromise, LazyPromiseStatus } from "./lazy_promise";

export interface UDPRequesterConfig {
  maxRetransmitCount: number;
  maxRetransmitRTOFactor: number;
  localPort?: number;
  initRTO?: number;
}

export class UDPRequester {
  private readonly maxRetransmitCount: number;
  private readonly maxRetransmitRTOFactor: number;

  private socket: Socket;
  private requestPromise: LazyPromise<Buffer>;
  private retransmitCount: number = 0;
  private RTO: number;
  private timer?: NodeJS.Timer;

  public constructor(config: Partial<UDPRequesterConfig>) {
    this.RTO = config.initRTO ?? 500;
    this.maxRetransmitCount = config.maxRetransmitCount ?? 7;
    this.maxRetransmitRTOFactor = config.maxRetransmitRTOFactor ?? 16;

    this.requestPromise = new LazyPromise<Buffer>();

    this.socket = createSocket({ type: "udp4", reuseAddr: true });

    if (config.localPort !== undefined) {
      this.socket.bind(config.localPort);
    }

    this.socket.addListener("message", (msg) => {
      this.resolve(msg);
    });

    this.socket.addListener("error", (err) => {
      this.reject(err);
    });
  }

  public async request(
    buffer: Buffer,
    address: string,
    port: number,
  ): Promise<Buffer> {
    this.send(buffer, port, address);

    return this.requestPromise.promise;
  }

  private send(buffer: Buffer, port: number, address: string) {
    if (this.requestPromise.status !== LazyPromiseStatus.init) {
      return;
    }

    if (this.retransmitCount > this.maxRetransmitCount) {
      this.reject("max retransmit count met");
      return;
    }

    this.socket.send(buffer, port, address);

    this.timer = setTimeout(() => {
      this.RTO *= 2;
      this.retransmitCount += 1;

      this.send(buffer, port, address);
    }, this.RTO);
  }

  private resolve(buffer: Buffer) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.socket.close();

    this.requestPromise.resolve(buffer);
  }

  private reject(err: any) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.socket.close();

    this.requestPromise.reject(err);
  }
}
