import fastify from "fastify";

const app = fastify();

app.post("/x", async (request, reply) => {
  reply.send({ data: "unprotected" });
});
