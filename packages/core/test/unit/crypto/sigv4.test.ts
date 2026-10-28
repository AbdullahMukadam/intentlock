import { expect, test } from "vitest";

import { sha256Hex, signV4 } from "../../../src/crypto/sigv4.js";

test("matches the AWS Signature Version 4 GET Object example", async () => {
  const headers = await signV4({
    method: "GET",
    url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
    headers: { Range: "bytes=0-9" },
    payloadHash: await sha256Hex(""),
    region: "us-east-1",
    service: "s3",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    now: new Date("2013-05-24T00:00:00Z"),
  });
  expect(headers.authorization).toBe(
    "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
      "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
  );
  expect(headers["x-amz-date"]).toBe("20130524T000000Z");
});
