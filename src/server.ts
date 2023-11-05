import { createSocket } from "node:dgram";
import {
  buildAttributes,
  buildHeader,
  buildMessage,
  parseRequest,
} from "./common";
import { STUNClass, STUNMethod } from "./types";
import { serialize } from "node:v8";

export function bind(port: number = 3478) {
  const server = createSocket("udp4");

  server.on("error", (err) => {
    //todo
    console.error(`server error:\n${err.stack}`);
    server.close();
  });

  server.on("message", async (msg: Buffer, rinfo) => {
    try {
      const requestMsg = parseRequest(msg);

      const responseHeader = await buildHeader({
        class: STUNClass.SuccessResponse,
        method: STUNMethod.Binding,
        transactionID: requestMsg.header.transactionID,
      });

      const responseAttributes = buildAttributes(rinfo);

      const responseMsg = buildMessage(responseHeader, responseAttributes);

      const buffer = serialize(responseMsg);
    } catch (e) {
      // ErrorResponse
    }
  });

  server.on("listening", () => {
    //todo
    const address = server.address();
    console.log(`server listening ${address.address}:${address.port}`);
  });

  server.bind(port);
}
