import { TransportEmitter } from "./interface";
import EventEmitter from "events";
import { RedisDuplex } from "../streams/redis-duplex";
import { Class } from "../utils/types";
import { Duplex } from "stream";
import { RedisClient } from "redis";
import {
  cure,
  promisify,
  getMemoValue,
  memo,
  putMemoValue,
  delay,
} from "../utils";

export class RedisTransportEmitter implements TransportEmitter {
  constructor(private queueSize: number, private redisClient: RedisClient) {}
  private streams: Map<string, RedisDuplex> = new Map();
  public async once(
    {
      event,
      canceler,
      timeout,
    }: {
      timeout?: number | Promise<any>;
      event: string;
      canceler: Generator<[boolean, EventEmitter], never, boolean>;
    },
    listener: (...args: any[]) => void
  ): Promise<void> {
    let stream = this.streams.get(event);
    if (!stream) {
      stream = new RedisDuplex(this.queueSize, event, this.redisClient);
      this.streams.set(event, stream);
    }
    const innerCanceler = memo(true);
    let result = stream.read(1);
    if (!result) {
      result = await Promise.race([
        (async function (passedCanceler, outterCanceler) {
          await promisify(cure(stream.once, stream)("readable"), stream);
          const shouldRun = [
            getMemoValue(passedCanceler),
            getMemoValue(outterCanceler),
          ].reduce((acc, curr) => acc && curr, true);
          if (shouldRun) {
            return (<Duplex>stream).read(1);
          }
        })(innerCanceler, canceler),
        (async function (passedCanceler) {
          if (typeof timeout === "number" || timeout === undefined) {
            await delay(timeout || 10_000);
          } else {
            await timeout;
          }
          putMemoValue(passedCanceler, false);
        })(innerCanceler),
      ]);
    }
    if (result && typeof result !== "boolean") {
      listener(...result);
    } else {
      listener();
    }
  }
  public async emit(
    { timeout, event }: { timeout?: number; event: string },
    ...args: any[]
  ): Promise<boolean> {
    let stream = this.streams.get(event);
    if (!stream) {
      stream = new RedisDuplex(this.queueSize, event, this.redisClient);
      this.streams.set(event, stream);
    }
    return stream.write(args);
  }
  public resetInternalStreams(): void {
    this.streams = new Map();
  }
  public setStream(key: string, stream: RedisDuplex): void {
    this.streams.set(key, stream);
  }
  public getStream(key: string): Duplex | undefined {
    return this.streams.get(key);
  }
  public getInternalStreamType(): Class<any> {
    return RedisDuplex;
  }
}
