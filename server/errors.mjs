export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const invalid = (message, details) =>
  new ApiError(400, "VALIDATION_ERROR", message, details);
export const notFound = (message = "This record was not found.") =>
  new ApiError(404, "NOT_FOUND", message);
export const conflict = (message) => new ApiError(409, "CONFLICT", message);
export const wrap = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
export const send = (res, data, status = 200) => res.status(status).json({ data });

export function errorHandler(error, req, res, _next) {
  if (error?.type === "entity.too.large")
    return res.status(413).json({
      error: {
        code: "UPLOAD_TOO_LARGE",
        message: "The uploaded file is too large. Choose an image under5MB.",
      },
    });
  if (error?.name === "ZodError") {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the highlighted fields.",
        details: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }
  if (error instanceof ApiError || error?.name === "PaymentError") {
    return res.status(error.status || error.httpStatus || 400).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
  }
  if (error?.code === "ER_DUP_ENTRY")
    return res.status(409).json({
      error: { code: "DUPLICATE_RECORD", message: "A record with those details already exists." },
    });
  if (error?.type === "entity.parse.failed")
    return res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "The request body is not valid JSON." } });
  const unavailable = [
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ER_ACCESS_DENIED_ERROR",
    "ER_BAD_DB_ERROR",
  ].includes(error?.code);
  // Never log request bodies, database connection details, provider credentials,
  // or raw provider responses. The request ID makes server incidents traceable.
  console.error(
    JSON.stringify({
      requestId: req.requestId,
      code: error?.code || "INTERNAL_ERROR",
      path: req.path,
    }),
  );
  return res.status(unavailable ? 503 : 500).json({
    error: {
      code: unavailable ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR",
      message: unavailable
        ? "The shop database is not available yet. Please try again shortly."
        : "We could not complete that request. Please try again.",
      requestId: req.requestId,
    },
  });
}
