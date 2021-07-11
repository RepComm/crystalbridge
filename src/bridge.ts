
import WebSocket from "ws";
import { Queue } from "./queue.js";


export type BridgeDesiredState = "open" | "closed";
export type BridgeActualState = BridgeDesiredState | "waiting" | "error";

export interface BridgeTask {
  /**The type of task*/
  type: BridgeTaskType;
  /**populated for task type "send", the content to be sent*/
  send?: string;
}

export type BridgeTaskType = "open" | "close" | "send";

export interface MessageListener {
  (msg: string): void;
}

export interface ErrorListener {
  (err: Error): void;
}

export interface StateListener {
  (old: BridgeActualState, current: BridgeActualState): void;
}

export class Bridge {
  private host: string;
  private port: number;
  private ws: WebSocket;

  private stateActual: BridgeActualState;
  private stateDesired: BridgeDesiredState;

  private tasks: Queue<BridgeTask>;

  private unsentMessages: Queue<BridgeTask>;

  private messageListeners: Set<MessageListener>;
  private errorListeners: Set<ErrorListener>;
  private stateListeners: Set<StateListener>;

  constructor() {
    this.host = "localhost";
    this.port = 10209;

    this.stateActual = "closed";

    this.tasks = new Queue();

    this.unsentMessages = new Queue();

    this.messageListeners = new Set();
    this.errorListeners = new Set();
    this.stateListeners = new Set();

    //task executor loop
    setInterval(() => {
      let task: BridgeTask;

      if (!this.tasks.isEmpty()) {
        task = this.tasks.dequeue();

        //see what we need to do
        switch (task.type) {
          case "close":
            //when we want to close connection

            switch (this.getActualState()) {
              case "closed":
                //do nothing
                break;
              case "error":
              case "open":
              case "waiting":
                this.tryClose();
                break;
            }
            break;

          case "open":
            //when we want to open connection

            switch (this.getActualState()) {
              case "closed":
              case "error":
                this.tryOpen();
                break;
              case "open":
                //already open
                break;
              case "waiting":
                //waiting
                break;

            }
            break;

        }
      }

      if (this.getActualState() === "open") {
        while (!this.unsentMessages.isEmpty()) {
          task = this.unsentMessages.dequeue();
          if (task.type === "send" && task.send !== "" || task.send !== undefined && task.send !== null) {
            this.ws.send(task.send);
          }
        }

      }

    }, 1000 / 4);
  }
  setDesiredState(state: BridgeDesiredState): this {
    this.stateDesired = state;
    if (this.stateDesired !== this.stateActual) {
      switch (this.stateDesired) {
        case "closed":
          this.tasks.enqueue({
            type: "close"
          });
          break;
        case "open":
          this.tasks.enqueue({
            type: "open"
          });
          break;
      }
    }
    return this;
  }
  getDesiredState(): BridgeDesiredState {
    return this.stateDesired;
  }
  getActualState(): BridgeActualState {
    return this.stateActual;
  }
  setActualState(state: BridgeActualState): this {
    let old = this.stateActual;
    this.stateActual = state;

    if (old !== state) {
      for (let cb of this.stateListeners) {
        cb(old, state);
      }
    }
    return this
  }
  /**Set the host to be connected to
   * 
   * Does not connect automatically unless reconnect == true and a connection already exists to some host
   * 
   * use setDesiredState("open") to apply these setting normally
   * 
   * @param host 
   * @param port 
   * @param reconnect 
   * @returns 
   */
  setHost(host: string, port: number, reconnect: boolean = true): this {
    //ignore if no change
    if (host == this.host && port === this.port) return this;
    this.host = host;
    this.port = port;

    if (reconnect && this.getActualState() === "open" || this.getActualState() === "waiting") {
      this.tasks.enqueue(
        //we need to close the old connection
        {
          type: "close"
        },

        //then connect to the new host
        {
          type: "open"
        }
      );
    }
    return this;
  }
  resolveHost(): string {
    return `ws://${this.host}:${this.port}`;
  }
  private tryOpen() {
    this.ws = new WebSocket(this.resolveHost());
    this.setActualState("waiting");
    this.ws.once("close", (code, reason) => {
      this.setActualState("closed");

      //if we didn't want to close, try to reconnect soon
      if (this.getDesiredState() === "open") this.tasks.enqueue({ type: "open" });
    });
    this.ws.once("open", () => {
      this.setActualState("open");

      //if we didn't want to be open, try to disconnect soon
      if (this.getDesiredState() === "closed") this.tasks.enqueue({ type: "close" });
    });
    this.ws.on("error", (err) => {
      for (let cb of this.errorListeners) {
        cb(err);
      }
    });
    this.ws.on("message", (data) => {
      let str: string;
      try {
        str = data.toString();
      } catch (ex) {
        console.warn(ex);
        return;
      }
      for (let cb of this.messageListeners) {
        cb(str);
      }
    });
  }
  private tryClose(code: number = undefined, reason: string = undefined) {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED || this.ws.readyState !== WebSocket.CLOSING) {
      this.ws.close(code, reason);
    }
    this.setActualState("closed");
  }
  on(type: "message" | "error" | "state", cb: ErrorListener | MessageListener | StateListener): this {
    if (type === "message") {
      this.messageListeners.add(cb as any);
    } else if (type === "error") {
      this.errorListeners.add(cb as any);
    } else if (type === "state") {
      this.stateListeners.add(cb as any);
    }
    return this;
  }
  send(msg: string): this {
    if (this.ws.OPEN) {
      this.ws.send(msg);
    } else {
      //if we're not connected right now, try to send once we reconnect
      this.unsentMessages.enqueue({
        type: "send",
        send: msg
      });
    }
    return this;
  }
}
