import { Duplex } from "stream";
import { RedisClient } from "redis";
import { RedisStreamPayload, RedisStreamResult } from "../utils/types";
import { parseRedisStreamPayload } from "../helpers";

class RedisDuplex extends Duplex {
  private currentIndex: string = "0";
  constructor(
    queueSize: number,
    private streamKey: string,
    private redisClient: RedisClient
  ) {
    super({
      objectMode: true,
      highWaterMark: queueSize,
      autoDestroy: false,
      emitClose: false,
    });
  }
  _destroy() {
    this.redisClient.del(this.streamKey);
  }
  _read(size: number) {
    (<any>this.redisClient).xread(
      "COUNT",
      size,
      "STREAMS",
      this.streamKey,
      this.currentIndex,
      (err: Error, res: RedisStreamPayload) => {
        if (err) {
          this.destroy(err);
        } else if (res) {
          const result = <RedisStreamResult>(
            parseRedisStreamPayload(res).find(
              (streamResult) => streamResult.streamKey === this.streamKey
            )
          );
          let nextIndex = this.currentIndex;
          result.data.forEach((event) => {
            nextIndex = event.eventKey;
            this.push(JSON.parse(event.data.value));
          });
          this.currentIndex = nextIndex;
        }
      }
    );
  }
  _write(chunck: any, _encoding: any, callback: (err?: Error) => void) {
    (<any>this.redisClient).xadd(
      this.streamKey,
      "*",
      "event",
      JSON.stringify(chunck),
      (err: Error, res: string) => {
        if (err) {
          callback(err);
        } else {
          callback();
        }
      }
    );
  }
}

export { RedisDuplex };
