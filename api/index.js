import handler from "../backend/server.js";

export default async function vercelHandler(req, res) {
  return handler(req, res);
}
