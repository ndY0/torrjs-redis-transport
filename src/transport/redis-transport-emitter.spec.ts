import "reflect-metadata";
import { delay, memo, putMemoValue } from "../utils";
import { RedisTransportEmitter } from "./redis-transport-emitter";
import { RedisClient } from "redis";
import { RedisDuplex } from "../streams/redis-duplex";

let client: RedisClient;
beforeAll(() => {
  client = new RedisClient({
    host: process.env.REDIS_HOST,
    port: +(<any>process.env.REDIS_PORT),
  });
});
afterAll(() => {
  client.quit();
}, 2_000);

describe("RedisTransportEmitter", () => {
  describe("constructor", () => {
    it("should set an an empty map in streams property", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      expect(streams?.value).toBeInstanceOf(Map);
      expect(streams?.value.size).toEqual(0);
    });
  });
  describe("once", () => {
    it("should create a Redis stream for the given event name if none is present, or reuse one if existing", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      emitter.once({ event: "test", canceler }, () => {});
      let streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      expect(streams?.value).toBeInstanceOf(Map);
      expect(streams?.value.size).toEqual(1);
      expect(streams?.value.get("test")).toBeInstanceOf(RedisDuplex);
      emitter.once({ event: "test", canceler }, () => {});
      expect(streams?.value.size).toEqual(1);
    });
    it("should return immediately the read value at first, if one present in wrapped stream", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      await emitter.emit({ event: "test2" }, {});
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      const testStream = streams?.value.get("test2");
      const spyRead = jest.spyOn(testStream, "read");
      emitter.once({ event: "test2", canceler }, (data) => {
        expect(data).toEqual({});
        expect(spyRead.mock.calls.length).toBeGreaterThanOrEqual(1);
      });
    });
    it("should  read a value at first, then wait for one present in wrapped stream", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      emitter.once({ event: "test3", canceler }, (data) => {
        expect(data).toEqual({});
        expect(spyRead.mock.calls.length).toBeGreaterThanOrEqual(1);
      });
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      const testStream = streams?.value.get("test3");
      const spyRead = jest.spyOn(testStream, "read");
      await delay(200);
      await emitter.emit({ event: "test3" }, {});
      // avoid immediat return and let handler execute properly
      await delay(3_000);
    });
    it("should await for data for 10 second before returning undefined", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      const res = await emitter.once(
        { event: "test4", canceler },
        (data) => {}
      );
      expect(res).toBeUndefined();
    });
    it("should await for data before timeout before returning undefined, and skip reading from inner stream", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      const res = await emitter.once(
        { event: "test5", canceler, timeout: 100 },
        (data) => {}
      );
      const testStream = streams?.value.get("test5");
      const spyRead = jest.spyOn(testStream, "read");
      await emitter.emit({ event: "test5" }, {});
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          expect(spyRead).toHaveBeenCalledTimes(0);
          resolve();
        }, 200)
      );
      expect(res).toBeUndefined();
    });
    it("should await for data before passed Promise resolve before returning undefined, and skip reading from inner stream", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      const timeoutPromise = delay(400);
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      const res = await emitter.once(
        { event: "test21", canceler, timeout: timeoutPromise },
        (data) => {}
      );
      const testStream = streams?.value.get("test21");
      const spyRead = jest.spyOn(testStream, "read");
      await emitter.emit({ event: "test21" }, {});
      await new Promise<void>((resolve) =>
        setTimeout(() => {
          expect(spyRead).toHaveBeenCalledTimes(0);
          resolve();
        }, 200)
      );
      expect(res).toBeUndefined();
    });
    it("should avoid reading from inner stream if cancellation event is triggered", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      const res = await Promise.all([
        emitter.once({ event: "test6", canceler }, (data) => {}),
        (async () => {
          const testStream = streams?.value.get("test6");
          const spyRead = jest.spyOn(testStream, "read");
          putMemoValue(canceler, false);
          await emitter.emit({ event: "test6" }, {});
          await new Promise<void>((resolve) =>
            setTimeout(() => {
              expect(spyRead).toHaveBeenCalledTimes(0);
              resolve();
            }, 200)
          );
        })(),
      ]);
      expect(res[0]).toBeUndefined();
    });
  });
  describe("emit", () => {
    it("should create a InMemory stream for the given event name if none is present, or reuse one if existing", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      emitter.once({ event: "test7", canceler }, () => {});
      let streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      expect(streams?.value).toBeInstanceOf(Map);
      expect(streams?.value.size).toEqual(1);
      expect(streams?.value.get("test7")).toBeInstanceOf(RedisDuplex);
      emitter.emit({ event: "test7" }, {});
      expect(streams?.value.size).toEqual(1);
    });
    it("should write to inner stream and return immediately if operation successfull", async () => {
      const emitter = new RedisTransportEmitter(10, client);
      const canceler = memo(true);
      await emitter.once({ event: "test8", canceler }, () => {});
      const streams = Reflect.getOwnPropertyDescriptor(emitter, "streams");
      const testStream = streams?.value.get("test8");
      const spyWrite = jest.spyOn(testStream, "write");
      await emitter.emit({ event: "test8" });
      expect(spyWrite).toHaveBeenCalledTimes(1);
    });
  });
  describe("getInternalStreamType", () => {
    it("should return the class object of the used internal stream", () => {
      const emitter = new RedisTransportEmitter(2, client);
      expect(emitter.getInternalStreamType()).toEqual(RedisDuplex);
    });
  });
  describe("setStream", () => {
    it("should set a duplex stream for the given key", () => {
      const emitter = new RedisTransportEmitter(2, client);
      emitter.setStream("test12", new (emitter.getInternalStreamType())(10));
      const streamsDescriptor = Reflect.getOwnPropertyDescriptor(
        emitter,
        "streams"
      );

      expect(streamsDescriptor?.value.get("test12")).toBeInstanceOf(
        RedisDuplex
      );
    });
  });
  describe("getStream", () => {
    it("should get a duplex stream for the given key", () => {
      const emitter = new RedisTransportEmitter(2, client);
      emitter.setStream("test13", new (emitter.getInternalStreamType())(10));
      const stream = emitter.getStream("test13");
      expect(stream).toBeInstanceOf(RedisDuplex);
    });
  });
  describe("resetInternalStreams", () => {
    it("should remove all internal representation of a stream", () => {
      const emitter = new RedisTransportEmitter(2, client);
      emitter.setStream("test14", new (emitter.getInternalStreamType())(10));
      emitter.resetInternalStreams();
      const streamsDescriptor = Reflect.getOwnPropertyDescriptor(
        emitter,
        "streams"
      );
      expect(streamsDescriptor?.value.size).toEqual(0);
    });
  });
});
