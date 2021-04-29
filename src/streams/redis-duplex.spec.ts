import "reflect-metadata";
import { RedisClient } from "redis";
import { RedisDuplex } from "./redis-duplex";
import { Duplex } from "stream";
import dotenv from "dotenv";
import { delay } from "../utils";
dotenv.config({ path: process.cwd() + "/.env.test" });

let client: RedisClient;
let client2: RedisClient;
beforeEach(() => {
  client = new RedisClient({
    host: process.env.REDIS_HOST,
    port: +(<any>process.env.REDIS_PORT),
  });
  client2 = new RedisClient({
    host: process.env.REDIS_HOST,
    port: +(<any>process.env.REDIS_PORT),
  });
});
afterEach(() => {
  client.quit();
  client2.quit();
});

describe("RedisDuplex", () => {
  describe("constructor", () => {
    it("should create a Duplex stream in object mode, with given highwatermark", () => {
      const duplex = new RedisDuplex(100, "test15", client);
      expect(duplex).toBeInstanceOf(Duplex);
      expect(duplex.readableHighWaterMark).toEqual(100);
      expect(duplex.writableHighWaterMark).toEqual(100);
      duplex.destroy();
    });
  });
  describe("write", () => {
    it("should call xadd of redis client on writable stream side usage", async () => {
      const xaddSpy = jest.spyOn(<any>client, "xadd");
      const cb = jest.fn();
      const duplex = new RedisDuplex(100, "test16", client);
      duplex.write({ test: "test" }, undefined, cb);
      expect(xaddSpy).toHaveBeenCalledWith(
        "test16",
        "*",
        "event",
        JSON.stringify({ test: "test" }),
        expect.anything()
      );
      await delay(200);
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenLastCalledWith();
      duplex.destroy();
    });
    it("should call xadd of redis client and emit error on writable stream side usage if an error occur", async () => {
      const xaddSpy = jest.fn((_1, _2, _3, _4, cb) => cb("test"));
      Reflect.set(client, "xadd", xaddSpy);
      const duplex = new RedisDuplex(100, "test17", client);
      duplex.on("error", (err) => {
        expect(err).toBeTruthy();
        console.log(err);
      });
      duplex.write({ test: "test" }, undefined);
      duplex.destroy();
      await delay(200);
    });
  });
  describe("read", () => {
    it("should return null if no data is present at provided stream key", () => {
      const duplex = new RedisDuplex(100, "test18", client);
      const data = duplex.read(1);
      expect(data).toEqual(null);
    });
    it("should read an entry of the stream if one have been pushed", async () => {
      const duplex = new RedisDuplex(100, "test19", client);
      const readDuplex = new RedisDuplex(100, "test19", client2);
      duplex.write({ test: "test" });
      await delay(200);
      readDuplex.on("readable", () => {
        const data = readDuplex.read(1);
        expect(data).toEqual({ test: "test" });
      });
      readDuplex.read(1);
      await delay(400);
      duplex.destroy();
      readDuplex.destroy();
    });
    it("should call xread of redis client and emit error on readable stream side usage if an error occur", async () => {
      const xreadSpy = jest.fn((_1, _2, _3, _4, _5, cb) => cb("test"));
      Reflect.set(client, "xread", xreadSpy);
      const duplex = new RedisDuplex(100, "test20", client);
      duplex.on("error", (err) => {
        expect(err).toBeTruthy();
        console.log(err);
      });
      duplex.read(1);
      duplex.destroy();
      await delay(200);
    });
  });
});
