type Class<T> = T & { new (...args: unknown[]): T };
type RedisStreamPayload = [string, [string, [string, string]][]][];
type RedisStreamResult = {
  streamKey: string;
  data: {
    eventKey: string;
    data: {
      key: string;
      value: string;
    };
  }[];
}[];

export { Class, RedisStreamPayload, RedisStreamResult };
