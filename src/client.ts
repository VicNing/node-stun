import { Socket, createSocket } from "node:dgram";
import {
  buildHeader,
  buildMessage,
  parseResponse,
  parseStunURI,
  serialize,
} from "./common";

import {
  STUNClass,
  STUNMethod,
  STUNMessage,
  BindingRequestOptions,
  UDPTransmitOptions,
} from "./types";

import { createConnection } from "node:net";

export async function bindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  if (options?.socketType === "tcp") {
    return tcpBindingRequest(uri, options);
  } else {
    return udpBindingRequest(uri, options);
  }
}

function udpBindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  return new Promise<STUNMessage>(async (resolve, reject) => {
    const maxRetransmissionCount = options?.maxRetransmissionCount ?? 7;
    const maxRetransmissionRTOFactor =
      options?.maxRetransmissionRTOFactor ?? 16;

    const { host, port } = parseStunURI(uri);

    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const socket = createSocket({ type: "udp4", reuseAddr: true }, (msg) => {
      clearTimeout(transmitOptions.timer);

      try {
        resolve(parseResponse(msg, message));
      } catch (e) {
        reject(e);
      }

      socket.close();
    });

    if (typeof options?.port === "number") {
      socket.bind(options.port);
    }

    socket.on("error", (err) => {
      if (err) {
        clearTimeout(transmitOptions.timer);
        reject(err);
      }
    });

    const transmitOptions: UDPTransmitOptions = {
      socket,
      buffer,
      port,
      host,
      rto: 500,
      timer: undefined,
      retransmissionCount: 0,
      maxRetransmissionCount,
      maxRetransmissionRTOFactor,
    };

    transmit(transmitOptions);
  });
}

function transmit(udpTransmitOptions: UDPTransmitOptions) {
  const { socket, buffer, port, host, rto } = udpTransmitOptions;

  socket.send(buffer, port, host);

  const timer = setTimeout(() => {
    transmit({
      ...udpTransmitOptions,
      rto: udpTransmitOptions.rto * 2,
      retransmissionCount: udpTransmitOptions.retransmissionCount + 1,
    });
  }, rto);

  udpTransmitOptions.timer = timer;
}

function tcpBindingRequest(
  uri: string,
  options?: BindingRequestOptions,
): Promise<STUNMessage> {
  return new Promise<STUNMessage>(async (resolve, reject) => {
    const { host, port } = parseStunURI(uri);

    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const socket = createConnection(
      { port, host, localPort: options?.port },
      () => {
        socket.write(buffer);
      },
    );

    socket.on("data", (buffer) => {
      try {
        const response = parseResponse(buffer, message);

        socket.end(() => {
          socket.destroy();
          resolve(response);
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}
