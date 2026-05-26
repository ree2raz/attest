import fastify from "fastify";

const app = fastify();

async function authHook(request: any, reply: any) {
  if (!request.headers.authorization) {
    reply.status(401).send({ error: "Unauthorized" });
  }
}

app.route({
  method: "POST",
  url: "/x",
  preHandler: authHook,
  handler: async (request, reply) => {
    reply.send({ ok: true });
  },
});
