export async function readJson(request) {
  if (request.body && typeof request.body === "object") return request.body;

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(payload));
}

export function rejectUnsupportedMethod(request, response, methods = ["POST"]) {
  if (methods.includes(request.method)) return false;
  response.setHeader("Allow", methods.join(", "));
  sendJson(response, 405, { detail: "Method not allowed." });
  return true;
}
