import { RedisStreamPayload, RedisStreamResult } from "../utils/types";

function parseRedisStreamPayload(
  payload: RedisStreamPayload
): RedisStreamResult[] {
  return payload.map((streamPayload) => {
    return {
      streamKey: streamPayload[0],
      data: streamPayload[1].map((streamPayloadData) => {
        return {
          eventKey: streamPayloadData[0],
          data: {
            key: streamPayloadData[1][0],
            value: streamPayloadData[1][1],
          },
        };
      }),
    };
  });
}

export { parseRedisStreamPayload };
