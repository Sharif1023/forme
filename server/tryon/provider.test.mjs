import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../errors.mjs";
import { DEFAULT_TRYON_MODEL, SUPPORTED_TRYON_MODELS, generateTryOnImage } from "./provider.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6ZQAAAABJRU5ErkJggg==",
  "base64",
);
const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
const request = () => ({
  apiKey: "private-project-key",
  model: DEFAULT_TRYON_MODEL,
  gender: "women",
  referenceImages: [
    { role: "model", dataUrl, name: "Adult model", color: "" },
    { role: "top", dataUrl, name: "Linen camp shirt", color: "Blue" },
    { role: "bottom", dataUrl, name: "Pleated trouser", color: "Cream" },
    { role: "shoes", dataUrl, name: "Pointed heel", color: "Black" },
  ],
});
const response = (value, init = {}) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" }, ...init });
const imageResponse = () => response({ data: [{ b64_json: png.toString("base64") }] });
const hasCode = (code) => (error) => error instanceof ApiError && error.code === code;

test("try-on sends4 ordered local image files to the fixed Lovable edit endpoint", async () => {
  let calls = 0;
  const input = request();
  input.referenceImages.reverse();
  const result = await generateTryOnImage(input, {
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://ai.gateway.lovable.dev/v1/images/edits");
      assert.equal(options.method, "POST");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, "Bearer private-project-key");
      assert.equal(options.headers["Lovable-API-Key"], "private-project-key");
      assert.equal(options.headers["Content-Type"], undefined);
      assert(options.signal instanceof AbortSignal);
      assert(options.body instanceof FormData);
      assert.equal(options.body.get("model"), DEFAULT_TRYON_MODEL);
      assert.equal(options.body.get("n"), "1");
      assert.equal(options.body.get("size"), "1024x1536");
      assert.equal(options.body.get("output_format"), "png");
      assert.equal(options.body.get("background"), "transparent");
      const images = options.body.getAll("image[]");
      assert.equal(images.length, 4);
      for (const [index, role] of ["model", "top", "bottom", "shoes"].entries()) {
        assert.equal(images[index].name, `${index + 1}-${role}.png`);
        assert.equal(images[index].type, "image/png");
        assert.deepEqual(Buffer.from(await images[index].arrayBuffer()), png);
      }
      const prompt = options.body.get("prompt");
      for (const text of [
        "adult female",
        "exact same",
        "Linen camp shirt",
        "Pleated trouser",
        "Pointed heel",
        "footwear",
        "transparent",
        "not a measurement",
      ])
        assert(prompt.includes(text));
      assert(!prompt.includes(input.apiKey));
      return imageResponse();
    },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { buffer: png, mimeType: "image/png" });
  assert.deepEqual(SUPPORTED_TRYON_MODELS, ["openai/gpt-image-2"]);
});

test("invalid credentials, unsupported models and invalid reference roles never contact a provider", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return imageResponse();
  };
  for (const apiKey of ["", "********", "key\nsecret"])
    await assert.rejects(
      generateTryOnImage({ ...request(), apiKey }, { fetchImpl }),
      hasCode("TRYON_NOT_CONFIGURED"),
    );
  await assert.rejects(
    generateTryOnImage({ ...request(), model: "https://other.example/model" }, { fetchImpl }),
    hasCode("TRYON_MODEL_UNSUPPORTED"),
  );
  await assert.rejects(
    generateTryOnImage({ ...request(), gender: "other" }, { fetchImpl }),
    hasCode("TRYON_REFERENCE_INVALID"),
  );
  const duplicate = request();
  duplicate.referenceImages[0].role = "top";
  await assert.rejects(
    generateTryOnImage(duplicate, { fetchImpl }),
    hasCode("TRYON_REFERENCE_INVALID"),
  );
  await assert.rejects(
    generateTryOnImage({ ...request(), referenceImages: [] }, { fetchImpl }),
    hasCode("TRYON_REFERENCE_INVALID"),
  );
  assert.equal(calls, 0);
});

test("reference URLs, disguised content, invalid base64 and oversized images are rejected locally", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return imageResponse();
  };
  for (const invalid of [
    "https://127.0.0.1/private.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64,=bad",
    "data:image/png;base64,SGVsbG8=",
    dataUrl.replace("image/png", "image/jpeg"),
  ]) {
    const input = request();
    input.referenceImages[1].dataUrl = invalid;
    await assert.rejects(
      generateTryOnImage(input, { fetchImpl }),
      hasCode("TRYON_REFERENCE_INVALID"),
    );
  }
  const tooBig = request();
  tooBig.referenceImages[1].dataUrl = `data:image/png;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString("base64")}`;
  await assert.rejects(generateTryOnImage(tooBig, { fetchImpl }), hasCode("TRYON_IMAGE_TOO_LARGE"));
  const injected = request();
  injected.referenceImages[1].name = "shirt\nother instructions";
  await assert.rejects(
    generateTryOnImage(injected, { fetchImpl }),
    hasCode("TRYON_REFERENCE_INVALID"),
  );
  assert.equal(calls, 0);
});

test("provider image URLs are never downloaded and empty or invalid output is rejected", async () => {
  let calls = 0;
  for (const value of [
    { data: [{ url: "http://127.0.0.1/private" }] },
    { data: [] },
    { data: [{ b64_json: "SGVsbG8=" }] },
    { data: [{ b64_json: "not-base64" }] },
  ]) {
    await assert.rejects(
      generateTryOnImage(request(), {
        fetchImpl: async () => {
          calls++;
          return response(value);
        },
      }),
      hasCode("TRYON_RESPONSE_INVALID"),
    );
  }
  assert.equal(calls, 4);
});

test("provider HTTP errors expose safe messages with no raw response or credential", async () => {
  for (const [status, code] of [
    [401, "TRYON_KEY_REJECTED"],
    [403, "TRYON_KEY_REJECTED"],
    [402, "TRYON_CREDITS_REQUIRED"],
    [429, "TRYON_PROVIDER_BUSY"],
    [500, "TRYON_PROVIDER_UNAVAILABLE"],
    [307, "TRYON_PROVIDER_UNAVAILABLE"],
  ]) {
    await assert.rejects(
      generateTryOnImage(request(), {
        fetchImpl: async () =>
          response({ secret: request().apiKey, upstream: "private detail" }, { status }),
      }),
      (error) =>
        hasCode(code)(error) &&
        !error.message.includes(request().apiKey) &&
        !error.message.includes("private detail"),
    );
  }
  await assert.rejects(
    generateTryOnImage(request(), {
      fetchImpl: async () => {
        throw Error(`Network detail ${request().apiKey}`);
      },
    }),
    (error) =>
      hasCode("TRYON_PROVIDER_UNAVAILABLE")(error) && !error.message.includes(request().apiKey),
  );
});

test("response decoding has bounded JSON and output image sizes", async () => {
  await assert.rejects(
    generateTryOnImage(request(), {
      fetchImpl: async () =>
        response(
          {},
          {
            headers: {
              "content-type": "application/json",
              "content-length": `${33 * 1024 * 1024}`,
            },
          },
        ),
    }),
    hasCode("TRYON_RESPONSE_TOO_LARGE"),
  );
  await assert.rejects(
    generateTryOnImage(request(), {
      fetchImpl: async () =>
        new Response("not JSON", { headers: { "content-type": "application/json" } }),
    }),
    hasCode("TRYON_RESPONSE_INVALID"),
  );
  await assert.rejects(
    generateTryOnImage(request(), { fetchImpl: async () => new Response("<html>bad</html>") }),
    hasCode("TRYON_RESPONSE_INVALID"),
  );
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1));
      controller.close();
    },
  });
  await assert.rejects(
    generateTryOnImage(request(), {
      fetchImpl: async () =>
        new Response(stream, { headers: { "content-type": "application/json" } }),
    }),
    hasCode("TRYON_RESPONSE_TOO_LARGE"),
  );
  const oversized = Buffer.alloc(20 * 1024 * 1024 + 1).toString("base64");
  await assert.rejects(
    generateTryOnImage(request(), {
      fetchImpl: async () => response({ data: [{ b64_json: oversized }] }),
    }),
    hasCode("TRYON_IMAGE_TOO_LARGE"),
  );
});

test("timeout covers stalled response bodies without automatic paid retries", async () => {
  let calls = 0;
  await assert.rejects(
    generateTryOnImage(request(), {
      timeoutMs: 15,
      fetchImpl: async () => {
        calls++;
        return new Response(new ReadableStream({ start() {} }), {
          headers: { "content-type": "application/json" },
        });
      },
    }),
    hasCode("TRYON_TIMEOUT"),
  );
  assert.equal(calls, 1);
});

test("caller cancellation is respected before and during a provider request", async () => {
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  let calls = 0;
  await assert.rejects(
    generateTryOnImage(
      { ...request(), signal: alreadyAborted.signal },
      {
        fetchImpl: async () => {
          calls++;
          return imageResponse();
        },
      },
    ),
    hasCode("TRYON_CANCELLED"),
  );
  assert.equal(calls, 0);
  const controller = new AbortController();
  await assert.rejects(
    generateTryOnImage(
      { ...request(), signal: controller.signal },
      {
        fetchImpl: async (_url, options) => {
          calls++;
          controller.abort();
          assert.equal(options.signal.aborted, true);
          return new Promise(() => {});
        },
      },
    ),
    hasCode("TRYON_CANCELLED"),
  );
  assert.equal(calls, 1);
});
