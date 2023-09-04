import { createSocket } from "node:dgram";
import { buildHeader, buildMessage, parseResponse, serialize } from "./common";

import { STUNClass, STUNMethod, STUNMessage } from "./types";

export async function bindingRequest(

  address: string,
  port: number,
): Promise<STUNMessage> {
  return new Promise<STUNMessage>(async (resolve, reject) => {
    const header = await buildHeader({
      method: STUNMethod.Binding,
      class: STUNClass.Request,
    });

    const message = buildMessage(header, []);

    const buffer = serialize(message);

    const socket = createSocket({ type: "udp4", reuseAddr: true }, (msg) => {
      try {
        resolve(parseResponse(msg, message));
      } catch (e) {
        reject(e);
      }

      socket.close();
    });

    socket.on("error", (err) => {
      if (err) {
        reject(err);
      }
    });

    socket.send(buffer, port, address, (err) => {
      if (err) {
        reject(err);
      }
    });
  });
}
